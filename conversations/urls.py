from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet, ConversationViewSet, ChatAPIView, chat_page

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("conversations", ConversationViewSet, basename="conversation")

urlpatterns = [
    # HTML page
    path("chat/", chat_page, name="chat_page"),

    # API
    path("api/", include(router.urls)),
    path("api/chat/", ChatAPIView.as_view(), name="chat_api"),
]