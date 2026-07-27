# accounts/forms.py
from django.contrib.auth.forms import UserCreationForm
from django import forms
from .models import User


class RegisterForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "first_name", "last_name", "email")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        required_fields = ["username", "first_name", "last_name", "email"]
        for field in required_fields:
            self.fields[field].required = True
            self.fields[field].error_messages["required"] = f"{self.fields[field].label} is required."

    def clean_email(self):
        email = self.cleaned_data["email"]
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError(
                "An account with this email already exists.")
        return email
