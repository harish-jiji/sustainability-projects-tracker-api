from django.db import models

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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Contributor(models.Model):
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    skills = models.TextField(help_text="Skills represented as plain text, comma-separated list, or JSON string.")
    joined_on = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Task(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    assigned_to = models.ForeignKey(Contributor, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    title = models.CharField(max_length=255)
    description = models.TextField()
    due_date = models.DateField()
    is_completed = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.title} ({self.project.name})"
