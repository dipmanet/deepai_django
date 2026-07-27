import os
from datetime import datetime
from django.conf import settings
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_groq import ChatGroq

# 1. Web search tool definition


@tool
def web_search(query: str) -> str:
    """Search the web for up-to-date information, news, or current facts."""
    try:
        ddg = DuckDuckGoSearchRun()
        return ddg.invoke(query)
    except Exception as e:
        return f"Search error: {str(e)}"


class LLMError(Exception):
    """Raised when the chat model cannot produce a response."""


def _get_llm():
    api_key = getattr(settings, "GROQ_API_KEY",
                      "") or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise LLMError("GROQ_API_KEY is not configured.")

    return ChatGroq(
        model='llama-3.3-70b-versatile',
        groq_api_key=api_key,
        temperature=0.3
    )


def generate_response(user_input, history):
    current_date = datetime.now().strftime("%B %d, %Y")

    # --- ChatGPT-Style System Prompt ---
    system_prompt_text = (
        f"You are DeepAI, a knowledgeable, empathetic, and highly capable AI assistant.\n"
        f"Today's date is {current_date}.\n\n"
        "### Guidelines:\n"
        "1. **Tone & Style:** Be helpful, clear, direct, and conversational. Avoid meta-talk like 'As an AI' or overly robotic intros. Adapt your depth to the user's technical level.\n"
        "2. **Formatting:** Use clean Markdown. Use code blocks with language tags for code, bold text for key terms, and bullet points or numbered lists for scannability.\n"
        "3. **Real-time Data:** You have access to a web search tool (`web_search`). Proactively search the web when asked about real-time news, current dates, recent releases, sports scores, or facts outside your training.\n"
        "4. **Coding & Technical Tasks:** Write clean, modern, well-commented code. Explain key concepts concisely after the code solution.\n"
        "5. **Accuracy:** If you don't know an exact answer or need up-to-date verification, use web search before answering."
    )

    system_prompt = SystemMessage(content=system_prompt_text)

    # Build conversation history
    messages = [system_prompt]

    for msg in history:
        if msg.sender == 'human':
            messages.append(HumanMessage(content=msg.text))
        elif msg.sender == 'ai':
            messages.append(AIMessage(content=msg.text))

    messages.append(HumanMessage(content=user_input))

    llm = _get_llm()
    llm_with_tools = llm.bind_tools([web_search])

    # Safe initial LLM invocation
    try:
        response = llm_with_tools.invoke(messages)
    except Exception:
        response = llm.invoke(messages)
        return response.content

    # Tool Execution Loop
    if response.tool_calls:
        messages.append(response)

        for tool_call in response.tool_calls:
            query = tool_call.get("args", {}).get("query", user_input)
            search_result = web_search.invoke(query)

            messages.append(
                ToolMessage(
                    content=str(search_result),
                    tool_call_id=tool_call["id"]
                )
            )

        try:
            final_response = llm_with_tools.invoke(messages)
            return final_response.content
        except Exception:
            final_response = llm.invoke(messages)
            return final_response.content

    return response.content


def get_ai_response(history, system_prompt=None):
    current_date = datetime.now().strftime("%B %d, %Y")
    prompt = system_prompt or (
        f"You are DeepAI, a knowledgeable, empathetic, and highly capable AI assistant.\n"
        f"Today's date is {current_date}."
    )
    messages = [SystemMessage(content=prompt)]

    for msg in history:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
        elif role == "system":
            messages.append(SystemMessage(content=content))

    try:
        response = _get_llm().invoke(messages)
    except LLMError:
        raise
    except Exception as exc:
        raise LLMError(str(exc)) from exc

    usage = getattr(response, "usage_metadata", None) or {}
    tokens = usage.get("total_tokens")
    return response.content, tokens
