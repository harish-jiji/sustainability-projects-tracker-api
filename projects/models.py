from django.db import models
from django.contrib.auth.models import User
from datetime import date

class Project(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Completed', 'Completed'),
        ('On Hold', 'On Hold'),
    ]

    name = models.CharField(max_length=255)
    description = models.TextField()
    location = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class AdminProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='admin_profile')
    security_answer_1 = models.CharField(max_length=255, blank=True, null=True)
    security_answer_2 = models.CharField(max_length=255, blank=True, null=True)
    security_answer_3 = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return f"AdminProfile of {self.user.username}"


class Contributor(models.Model):
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    skills = models.TextField(blank=True, null=True, help_text="Skills represented as plain text, comma-separated list, or JSON string.")
    joined_on = models.DateTimeField(auto_now_add=True)
    joined_date = models.DateField(default=date.today)
    password = models.CharField(max_length=255, blank=True, null=True)
    is_temp_password = models.BooleanField(default=True)
    security_answer_1 = models.CharField(max_length=255, blank=True, null=True)
    security_answer_2 = models.CharField(max_length=255, blank=True, null=True)
    security_answer_3 = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name


class Task(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Completed', 'Completed'),
        ('On Hold', 'On Hold'),
    ]

    projects = models.ManyToManyField(Project, related_name='tasks')
    assigned_to = models.ForeignKey(Contributor, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    title = models.CharField(max_length=255)
    description = models.TextField()
    due_date = models.DateField()
    is_completed = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')

    def save(self, *args, **kwargs):
        if self.is_completed and self.status != 'Completed':
            self.status = 'Completed'
        elif not self.is_completed and self.status == 'Completed':
            self.status = 'Active'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title}"


