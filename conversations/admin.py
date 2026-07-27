from django.contrib import admin

from .models import Conversation, Message, Project


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "updated_at", "created_at")
    list_filter = ("created_at", "updated_at")
    search_fields = ("name", "description", "instructions", "user__username")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "project", "is_archived", "updated_at", "created_at")
    list_filter = ("is_archived", "created_at", "updated_at")
    search_fields = ("title", "user__username", "project__name")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "role", "tokens_used", "created_at")
    list_filter = ("role", "created_at")
    search_fields = ("content", "conversation__title", "conversation__user__username")
    readonly_fields = ("id", "created_at")
