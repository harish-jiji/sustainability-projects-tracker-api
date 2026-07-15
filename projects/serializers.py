from rest_framework import serializers
from .models import Project, Contributor, Task
from datetime import date

class ContributorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contributor
        fields = ['id', 'name', 'email', 'skills', 'joined_on']


class ProjectTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['id', 'title', 'is_completed']


class ProjectSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField(source='tasks.count', read_only=True)
    completed_task_count = serializers.SerializerMethodField()
    tasks_details = ProjectTaskSerializer(source='tasks', many=True, read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'name', 'description', 'location', 'status', 'due_date',
            'created_at', 'updated_at', 'task_count', 'completed_task_count',
            'tasks_details'
        ]

    def get_completed_task_count(self, obj):
        return obj.tasks.filter(is_completed=True).count()


class TaskProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['id', 'name']


class TaskSerializer(serializers.ModelSerializer):
    projects = serializers.PrimaryKeyRelatedField(many=True, queryset=Project.objects.all(), required=False)
    projects_details = TaskProjectSerializer(source='projects', many=True, read_only=True)
    project_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True)
    assigned_to_email = serializers.CharField(source='assigned_to.email', read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'projects', 'projects_details', 'project_name', 'assigned_to', 'assigned_to_name',
            'assigned_to_email', 'title', 'description', 'due_date', 'is_completed', 'is_overdue', 'status'
        ]

    def get_project_name(self, obj):
        return ", ".join([p.name for p in obj.projects.all()])

    def get_is_overdue(self, obj):
        return not obj.is_completed and obj.due_date < date.today()

