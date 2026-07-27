from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import ProjectViewSet, ConversationViewSet, ChatAPIView, chat_page

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("conversations", ConversationViewSet, basename="conversation")

api_urlpatterns = [
    path("", include(router.urls)),
    path("chat/", ChatAPIView.as_view(), name="chat_api"),
]

urlpatterns = [
    path("", chat_page, name="chat_page"),  # template view below
]
