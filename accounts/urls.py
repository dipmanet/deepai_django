# accounts/urls.py
from django.contrib.auth import views as auth_views
from django.urls import path
from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", auth_views.LoginView.as_view(template_name="accounts/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("password-reset/", auth_views.PasswordResetView.as_view(), name="password_reset"),
    # ... password_reset_done, confirm, complete
]