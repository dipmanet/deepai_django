(function () {
	const shell = document.getElementById("chat-shell");
	const CHAT_URL = shell.dataset.apiChatUrl;
	const CONVERSATIONS_URL = shell.dataset.apiConversationsUrl;
	const PROJECTS_URL = shell.dataset.apiProjectsUrl;
	const csrftoken = document.querySelector("[name=csrfmiddlewaretoken]")
		? document.querySelector("[name=csrfmiddlewaretoken]").value
		: getCookie("csrftoken");

	function getCookie(name) {
		const value = `; ${document.cookie}`;
		const parts = value.split(`; ${name}=`);
		if (parts.length === 2) return parts.pop().split(";").shift();
		return "";
	}

	const state = {
		activeConversationId: null,
		activeProjectId: null,
		draggedConversationRow: null,
	};

	// ---------- Elements ----------
	const chatEmpty = document.getElementById("chat-empty");
	const chatThread = document.getElementById("chat-thread");
	const chatScroll = document.getElementById("chat-scroll");
	const titleEl = document.getElementById("current-conversation-title");
	const projectPillEl = document.getElementById("current-project-pill");
	const composerForm = document.getElementById("composer-form");
	const composerInput = document.getElementById("composer-input");
	const composerSend = document.getElementById("composer-send");
	const conversationList = document.getElementById("conversation-list");
	const projectList = document.getElementById("project-list");
	const conversationContextMenu = document.getElementById("conversation-context-menu");

	// ---------- Helpers ----------
	function escapeHtml(str) {
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	}

	function timeLabel(iso) {
		const d = new Date(iso);
		return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	function renderMessage({ role, content, created_at }) {
		const row = document.createElement("div");
		row.className = `msg-row ${role}`;
		row.innerHTML = `
      <div class="msg-avatar">${role === "user" ? "You".slice(0, 1) : "✦"}</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-author">${role === "user" ? "You" : "Thread"}</span>
          <span class="msg-time">${created_at ? timeLabel(created_at) : ""}</span>
        </div>
        <div class="msg-content">${escapeHtml(content)}</div>
      </div>
    `;
		chatThread.appendChild(row);
		return row;
	}

	function showThread() {
		chatEmpty.style.display = "none";
		chatThread.style.display = "block";
	}

	function showEmpty() {
		chatEmpty.style.display = "flex";
		chatThread.style.display = "none";
		chatThread.innerHTML = "";
	}

	function scrollToBottom() {
		chatScroll.scrollTop = chatScroll.scrollHeight;
	}

	function setActiveConversationRow(id) {
		document.querySelectorAll(".convo-row").forEach((row) => {
			row.classList.toggle("active", row.dataset.conversationId === id);
		});
	}

	function setActiveProjectRow(id) {
		document.querySelectorAll(".project-row").forEach((row) => {
			row.classList.toggle("active", row.dataset.projectId === id);
		});
	}

	function getProjects() {
		return Array.from(projectList.querySelectorAll(".project-row")).map((row) => ({
			id: row.dataset.projectId,
			name: row.querySelector(".row-label").textContent.trim(),
		}));
	}

	function getProjectName(projectId) {
		const row = projectList.querySelector(`[data-project-id="${projectId}"].project-row`);
		return row ? row.querySelector(".row-label").textContent.trim() : "";
	}

	function getProjectGroup(projectId) {
		return projectList.querySelector(`.project-group[data-project-id="${projectId}"]`);
	}

	function getProjectConversationList(projectId) {
		return projectList.querySelector(`[data-project-conversations-for="${projectId}"]`);
	}

	// ---------- Project expand / collapse (sidebar-only, never touches the chat pane) ----------
	function setProjectGroupExpanded(group, expanded) {
		if (!group) return;
		const list = group.querySelector(".project-conversation-list");
		const row = group.querySelector(".project-row");
		if (list) list.classList.toggle("collapsed", !expanded);
		group.classList.toggle("expanded", expanded);
		if (row) row.setAttribute("aria-expanded", String(expanded));
	}

	function toggleProjectGroup(group) {
		if (!group) return;
		const list = group.querySelector(".project-conversation-list");
		const isCollapsed = list ? list.classList.contains("collapsed") : false;
		setProjectGroupExpanded(group, isCollapsed);
	}

	function expandProjectGroupFor(projectId) {
		if (!projectId) return;
		setProjectGroupExpanded(getProjectGroup(projectId), true);
	}

	function ensureRecentEmptyState() {
		const hasConversationRows = Boolean(conversationList.querySelector(".convo-row"));
		const emptyState = conversationList.querySelector(".recent-empty");

		if (hasConversationRows && emptyState) {
			emptyState.remove();
		}

		if (!hasConversationRows && !emptyState) {
			const message = document.createElement("p");
			message.className = "help-text recent-empty";
			message.style.padding = "0.3rem 0.6rem";
			message.textContent = "No conversations yet - start one above.";
			conversationList.appendChild(message);
		}
	}

	function ensureProjectEmptyState(list) {
		if (!list) return;

		const hasConversationRows = Boolean(list.querySelector(".convo-row"));
		const emptyState = list.querySelector(".project-empty");

		if (hasConversationRows && emptyState) {
			emptyState.remove();
		}

		if (!hasConversationRows && !emptyState) {
			const message = document.createElement("p");
			message.className = "help-text project-empty";
			message.textContent = "No conversations";
			list.appendChild(message);
		}
	}

	function closeConversationMenu() {
		conversationContextMenu.classList.remove("open");
		conversationContextMenu.setAttribute("aria-hidden", "true");
		conversationContextMenu.innerHTML = "";
	}

	// ---------- Move a conversation into a project (used by both drag-drop and the ⋯ menu) ----------
	async function moveConversationToProject(conversationId, projectId, projectName, row) {
		if (!row) return;
		row.classList.add("is-moving");

		const sourceProjectList = row.closest(".project-conversation-list");
		const targetProjectList = getProjectConversationList(projectId);

		let res;
		try {
			res = await fetch(`${CONVERSATIONS_URL}${conversationId}/`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"X-CSRFToken": csrftoken,
				},
				body: JSON.stringify({ project: projectId }),
			});
		} catch (err) {
			row.classList.remove("is-moving");
			return;
		}

		if (!res.ok) {
			row.classList.remove("is-moving");
			return;
		}

		row.classList.remove("is-moving", "is-dragging", "active");
		row.classList.add("project-convo-row");
		row.remove();

		if (targetProjectList) {
			const targetEmptyState = targetProjectList.querySelector(".project-empty");
			if (targetEmptyState) targetEmptyState.remove();
			targetProjectList.prepend(row);
		}

		// Both the source (Recent, or another project) and the destination need
		// their empty-state / row bookkeeping refreshed so the sidebar reflects
		// the move immediately.
		ensureRecentEmptyState();
		ensureProjectEmptyState(sourceProjectList);
		ensureProjectEmptyState(targetProjectList);

		// Reveal where the conversation landed.
		expandProjectGroupFor(projectId);

		if (state.activeConversationId === conversationId) {
			state.activeProjectId = projectId;
			projectPillEl.style.display = "inline";
			projectPillEl.textContent = projectName;
			setActiveProjectRow(projectId);
		}
	}

	// Delegated on #project-list (not per-row) so clicking a project always
	// works, regardless of when the row was inserted — page load, a freshly
	// created project, or anything else that adds a .project-row later.
	projectList.addEventListener("click", (event) => {
		if (event.target.closest(".row-menu-btn")) return;
		const row = event.target.closest(".project-row");
		if (!row || !projectList.contains(row)) return;
		toggleProjectGroup(row.closest(".project-group"));
	});

	projectList.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		const row = event.target.closest(".project-row");
		if (!row || !projectList.contains(row)) return;
		event.preventDefault();
		toggleProjectGroup(row.closest(".project-group"));
	});

	// ---------- Drag and drop: bind each project-group as its own drop zone ----------
	function bindProjectGroupDropZone(group) {
		const row = group.querySelector(".project-row");
		if (!row) return;
		let dragCounter = 0;

		group.addEventListener("dragenter", (event) => {
			console.log("drag enter");
			if (!state.draggedConversationRow) return;
			event.preventDefault();
			dragCounter += 1;
			row.classList.add("drop-over");
		});

		group.addEventListener("dragover", (event) => {
			console.log("drag over");
			if (!state.draggedConversationRow) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
		});

		group.addEventListener("dragleave", () => {
			console.log("drag leave");
			if (!state.draggedConversationRow) return;
			dragCounter = Math.max(0, dragCounter - 1);
			if (dragCounter === 0) row.classList.remove("drop-over");
		});

		group.addEventListener("drop", async (event) => {
			event.preventDefault();
			console.log("drop");
			dragCounter = 0;
			row.classList.remove("drop-over");

			const conversationId =
				event.dataTransfer.getData("text/plain") ||
				state.draggedConversationRow?.dataset.conversationId;
			const draggedRow =
				state.draggedConversationRow ||
				(conversationId
					? document.querySelector(`[data-conversation-id="${conversationId}"]`)
					: null);

			state.draggedConversationRow = null;

			if (!conversationId || !draggedRow) return;
			// Already living in this exact project — nothing to do.
			if (draggedRow.closest(".project-group") === group) return;

			await moveConversationToProject(
				conversationId,
				group.dataset.projectId,
				row.querySelector(".row-label").textContent.trim(),
				draggedRow,
			);
		});
	}

	function openConversationMenu(event, row) {
		event.preventDefault();
		event.stopPropagation();

		const projects = getProjects();
		conversationContextMenu.innerHTML = "";

		if (!projects.length) {
			const item = document.createElement("button");
			item.type = "button";
			item.className = "context-menu-item";
			item.disabled = true;
			item.textContent = "No projects";
			conversationContextMenu.appendChild(item);
		} else {
			projects.forEach((project) => {
				const item = document.createElement("button");
				item.type = "button";
				item.className = "context-menu-item";
				item.textContent = project.name;
				item.addEventListener("click", async () => {
					await moveConversationToProject(
						row.dataset.conversationId,
						project.id,
						project.name,
						row,
					);
					closeConversationMenu();
				});
				conversationContextMenu.appendChild(item);
			});
		}

		conversationContextMenu.classList.add("open");
		conversationContextMenu.setAttribute("aria-hidden", "false");

		const menuRect = conversationContextMenu.getBoundingClientRect();
		const left = Math.min(event.clientX, window.innerWidth - menuRect.width - 8);
		const top = Math.min(event.clientY, window.innerHeight - menuRect.height - 8);
		conversationContextMenu.style.left = `${Math.max(8, left)}px`;
		conversationContextMenu.style.top = `${Math.max(8, top)}px`;
	}

	function bindConversationRow(row) {
		row.addEventListener("click", () => loadConversation(row.dataset.conversationId));
		row.draggable = true;

		const label = row.querySelector(".row-label");
		if (label) {
			row.setAttribute("aria-label", `Drag ${label.textContent.trim()} to a project`);
		}

		row.addEventListener("dragstart", (event) => {
			console.log("drag start conversation");
			closeConversationMenu();
			state.draggedConversationRow = row;
			row.classList.add("is-dragging");
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", row.dataset.conversationId);
		});

		row.addEventListener("dragend", () => {
			console.log("drag end conversation");
			row.classList.remove("is-dragging");
			document
				.querySelectorAll(".project-row.drop-over")
				.forEach((r) => r.classList.remove("drop-over"));
			state.draggedConversationRow = null;
		});

		const menuButton = row.querySelector(".row-menu-btn");
		if (menuButton) {
			menuButton.addEventListener("click", (event) => openConversationMenu(event, row));
		}
	}

	function addTypingIndicator() {
		const row = document.createElement("div");
		row.className = "msg-row assistant";
		row.id = "typing-row";
		row.innerHTML = `
      <div class="msg-avatar">✦</div>
      <div class="msg-body">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    `;
		chatThread.appendChild(row);
		scrollToBottom();
	}

	function removeTypingIndicator() {
		const row = document.getElementById("typing-row");
		if (row) row.remove();
	}

	// ---------- Load a conversation's full history ----------
	async function loadConversation(id) {
		state.activeConversationId = id;
		setActiveConversationRow(id);
		showThread();
		chatThread.innerHTML = "";

		const res = await fetch(`${CONVERSATIONS_URL}${id}/`, {
			headers: { Accept: "application/json" },
		});
		if (!res.ok) return;
		const data = await res.json();

		titleEl.textContent = data.title;
		if (data.project) {
			projectPillEl.style.display = "inline";
			projectPillEl.textContent = getProjectName(data.project);
			state.activeProjectId = data.project;
			setActiveProjectRow(data.project);
			// Reveal the parent project in the sidebar so the conversation's
			// context is visible — this does NOT touch the chat pane itself.
			expandProjectGroupFor(data.project);
		} else {
			projectPillEl.style.display = "none";
			state.activeProjectId = null;
			setActiveProjectRow(null);
		}
		data.messages.forEach(renderMessage);
		scrollToBottom();
	}

	function startNewChat() {
		state.activeConversationId = null;
		state.activeProjectId = null;
		titleEl.textContent = "New chat";
		projectPillEl.style.display = "none";
		setActiveConversationRow(null);
		setActiveProjectRow(null);
		showEmpty();
		composerInput.focus();
	}

	function prependConversationToSidebar(conversation) {
		const existing = document.querySelector(`[data-conversation-id="${conversation.id}"]`);
		if (existing) existing.remove();

		const row = document.createElement("div");
		row.className = "convo-row active";
		row.dataset.conversationId = conversation.id;
		row.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="row-label">${escapeHtml(conversation.title)}</span>
      <button type="button" class="row-menu-btn" aria-label="Conversation options">⋯</button>
    `;
		bindConversationRow(row);

		if (conversation.project) {
			row.classList.add("project-convo-row");
			const projectConversationList = getProjectConversationList(conversation.project);
			if (projectConversationList) {
				const emptyState = projectConversationList.querySelector(".project-empty");
				if (emptyState) emptyState.remove();
				projectConversationList.prepend(row);
				ensureProjectEmptyState(projectConversationList);
			}
			expandProjectGroupFor(conversation.project);
		} else {
			conversationList.prepend(row);
			ensureRecentEmptyState();
		}

		setActiveConversationRow(conversation.id);
	}

	// ---------- Send a message ----------
	async function sendMessage(text) {
		showThread();
		renderMessage({ role: "user", content: text, created_at: new Date().toISOString() });
		scrollToBottom();
		addTypingIndicator();
		composerSend.disabled = true;

		try {
			const res = await fetch(CHAT_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-CSRFToken": csrftoken,
				},
				body: JSON.stringify({
					message: text,
					conversation_id: state.activeConversationId,
					project_id: state.activeProjectId,
				}),
			});

			removeTypingIndicator();

			if (!res.ok) {
				renderMessage({
					role: "assistant",
					content: "Something went wrong reaching the model. Please try again.",
					created_at: new Date().toISOString(),
				});
				scrollToBottom();
				return;
			}

			const data = await res.json();

			if (!state.activeConversationId) {
				state.activeConversationId = data.conversation_id;
				titleEl.textContent = data.conversation_title;
				prependConversationToSidebar({
					id: data.conversation_id,
					title: data.conversation_title,
					project: state.activeProjectId,
				});
			}

			renderMessage(data.message);
			scrollToBottom();
		} catch (err) {
			removeTypingIndicator();
			renderMessage({
				role: "assistant",
				content: "Network error — check your connection and try again.",
				created_at: new Date().toISOString(),
			});
		} finally {
			composerSend.disabled = false;
		}
	}

	// ---------- Composer ----------
	composerForm.addEventListener("submit", (e) => {
		e.preventDefault();
		const text = composerInput.value.trim();
		if (!text) return;
		composerInput.value = "";
		composerInput.style.height = "auto";
		sendMessage(text);
	});

	composerInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			composerForm.requestSubmit();
		}
	});

	composerInput.addEventListener("input", () => {
		composerInput.style.height = "auto";
		composerInput.style.height = Math.min(composerInput.scrollHeight, 200) + "px";
	});

	// ---------- Sidebar interactions ----------
	document.getElementById("new-chat-btn").addEventListener("click", startNewChat);

	document.querySelectorAll(".convo-row").forEach((row) => {
		bindConversationRow(row);
	});

	projectList.querySelectorAll(".project-group").forEach(bindProjectGroupDropZone);

	document.querySelectorAll(".suggestion-card").forEach((card) => {
		card.addEventListener("click", () => {
			composerInput.value = card.dataset.suggestion;
			composerInput.focus();
		});
	});

	// ---------- Search ----------
	document.getElementById("search-input").addEventListener("input", (e) => {
		const q = e.target.value.toLowerCase();
		document.querySelectorAll(".convo-row").forEach((row) => {
			const label = row.querySelector(".row-label").textContent.toLowerCase();
			row.style.display = label.includes(q) ? "flex" : "none";
		});
	});

	document.addEventListener("click", closeConversationMenu);
	window.addEventListener("resize", closeConversationMenu);
	window.addEventListener("scroll", closeConversationMenu, true);

	// ---------- Mobile sidebar ----------
	const sidebar = document.getElementById("sidebar");
	const openBtn = document.getElementById("open-sidebar-btn");
	const closeBtn = document.getElementById("close-sidebar-btn");
	if (openBtn) {
		openBtn.addEventListener("click", () => {
			sidebar.classList.add("open");
			closeBtn.style.display = "inline-flex";
		});
	}
	if (closeBtn) {
		closeBtn.addEventListener("click", () => sidebar.classList.remove("open"));
	}

	// ---------- New project modal ----------
	const modal = document.getElementById("new-project-modal");
	document
		.getElementById("new-project-btn")
		.addEventListener("click", () => modal.classList.add("open"));
	document
		.getElementById("cancel-project-btn")
		.addEventListener("click", () => modal.classList.remove("open"));
	modal.addEventListener("click", (e) => {
		if (e.target === modal) modal.classList.remove("open");
	});

	document.getElementById("new-project-form").addEventListener("submit", async (e) => {
		e.preventDefault();
		const name = document.getElementById("project-name-input").value.trim();
		const instructions = document.getElementById("project-instructions-input").value.trim();
		if (!name) return;

		const res = await fetch(PROJECTS_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-CSRFToken": csrftoken,
			},
			body: JSON.stringify({ name, instructions }),
		});

		if (res.ok) {
			const project = await res.json();
			const group = document.createElement("div");
			const row = document.createElement("div");
			const conversationListEl = document.createElement("div");
			group.className = "project-group";
			group.dataset.projectId = project.id;
			row.className = "project-row";
			row.dataset.projectId = project.id;
			row.setAttribute("role", "button");
			row.setAttribute("tabindex", "0");
			row.setAttribute("aria-expanded", "false");
			row.innerHTML = `
        <svg class="project-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>
        <span class="row-label">${escapeHtml(project.name)}</span>
        <button type="button" class="row-menu-btn" aria-label="Project options">⋯</button>
      `;
			conversationListEl.className = "project-conversation-list collapsed";
			conversationListEl.dataset.projectConversationsFor = project.id;
			ensureProjectEmptyState(conversationListEl);
			group.appendChild(row);
			group.appendChild(conversationListEl);
			bindProjectGroupDropZone(group);
			const emptyProjectState = projectList.querySelector(".project-list-empty");
			if (emptyProjectState) emptyProjectState.remove();
			projectList.appendChild(group);
			modal.classList.remove("open");
			document.getElementById("new-project-form").reset();
		}
	});
})();
