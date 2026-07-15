from rest_framework import serializers
from .models import Project, Contributor, Task
from datetime import date

class ContributorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contributor
        fields = ['id', 'name', 'email', 'skills', 'joined_on']


class ProjectSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField(source='tasks.count', read_only=True)
    completed_task_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'location', 'status', 'created_at', 'updated_at', 'task_count', 'completed_task_count']

    def get_completed_task_count(self, obj):
        return obj.tasks.filter(is_completed=True).count()


class TaskSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True)
    assigned_to_email = serializers.CharField(source='assigned_to.email', read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'project', 'project_name', 'assigned_to', 'assigned_to_name',
            'assigned_to_email', 'title', 'description', 'due_date', 'is_completed', 'is_overdue'
        ]

    def get_is_overdue(self, obj):
        return not obj.is_completed and obj.due_date < date.today()
