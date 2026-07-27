from django.views.generic import CreateView
from django.urls import reverse_lazy
from .forms import RegisterForm
from .models import User


class RegisterView(CreateView):
    model = User
    form_class = RegisterForm
    template_name = "accounts/register.html"
    success_url = reverse_lazy("login")
