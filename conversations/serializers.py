# conversations/serializers.py
from rest_framework import serializers
from .models import Project, Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["id", "role", "content", "created_at"]
        read_only_fields = ["id", "created_at"]


class ConversationListSerializer(serializers.ModelSerializer):
    """Lightweight — used for sidebar history list"""
    project_name = serializers.CharField(
        source="project.name", read_only=True, default=None)

    class Meta:
        model = Conversation
        fields = ["id", "title", "project",
                  "project_name", "is_archived", "updated_at"]

    def validate_project(self, project):
        if project and project.user != self.context["request"].user:
            raise serializers.ValidationError("Select one of your own projects.")
        return project


class ConversationDetailSerializer(serializers.ModelSerializer):
    """Full conversation with nested messages"""
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = ["id", "title", "project", "is_archived",
                  "created_at", "updated_at", "messages"]


class ProjectSerializer(serializers.ModelSerializer):
    conversation_count = serializers.IntegerField(
        source="conversations.count", read_only=True)

    class Meta:
        model = Project
        fields = ["id", "name", "description", "instructions",
                  "conversation_count", "created_at", "updated_at"]


class ChatRequestSerializer(serializers.Serializer):
    conversation_id = serializers.UUIDField(required=False, allow_null=True)
    project_id = serializers.UUIDField(required=False, allow_null=True)
    message = serializers.CharField(allow_blank=False, trim_whitespace=True)
