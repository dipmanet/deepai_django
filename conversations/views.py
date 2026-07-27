from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import Project, Conversation, Message
from .serializers import (
    ProjectSerializer, ConversationListSerializer,
    ConversationDetailSerializer, ChatRequestSerializer, MessageSerializer,
)
from .permissions import IsOwner
from . import llm


from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def chat_page(request):
    projects = request.user.projects.all()
    conversations = request.user.conversations.filter(
        is_archived=False,
        project__isnull=True,
    )[:50]
    return render(request, "conversations/chat.html", {
        "projects": projects, "conversations": conversations,
    })


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ConversationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        qs = Conversation.objects.filter(user=self.request.user)
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        archived = self.request.query_params.get("archived")
        if archived is not None:
            qs = qs.filter(is_archived=archived.lower() == "true")
        ungrouped = self.request.query_params.get("ungrouped")
        if ungrouped is not None:
            qs = qs.filter(project__isnull=ungrouped.lower() == "true")
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ConversationDetailSerializer
        return ConversationListSerializer


class ChatAPIView(APIView):
    """Handles sending a message and getting an AI response."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        conv_id = data.get("conversation_id")
        if conv_id:
            conversation = get_object_or_404(
                Conversation, id=conv_id, user=request.user)
        else:
            conversation = Conversation.objects.create(
                user=request.user,
                project_id=data.get("project_id"),
                title=data["message"][:50],
            )

        user_msg = Message.objects.create(
            conversation=conversation, role=Message.Role.USER, content=data["message"]
        )

        # build history for context
        history = list(conversation.messages.values("role", "content"))

        try:
            ai_content, tokens = llm.get_ai_response(
                history=history,
                system_prompt=conversation.project.instructions if conversation.project else None,
            )
        except llm.LLMError as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        assistant_msg = Message.objects.create(
            conversation=conversation, role=Message.Role.ASSISTANT,
            content=ai_content, tokens_used=tokens,
        )
        conversation.save(update_fields=["updated_at"])

        return Response({
            "conversation_id": conversation.id,
            "conversation_title": conversation.title,
            "message": MessageSerializer(assistant_msg).data,
        }, status=status.HTTP_201_CREATED)
