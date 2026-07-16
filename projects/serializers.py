from rest_framework import serializers
from .models import Project, Contributor, Task
from datetime import date

from django.contrib.auth.hashers import make_password

class ContributorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contributor
        fields = [
            'id', 'name', 'email', 'skills', 'joined_on', 'joined_date', 
            'password', 'is_temp_password', 'security_answer_1', 
            'security_answer_2', 'security_answer_3'
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'security_answer_1': {'write_only': True, 'required': False},
            'security_answer_2': {'write_only': True, 'required': False},
            'security_answer_3': {'write_only': True, 'required': False},
            'is_temp_password': {'read_only': True}
        }

    def create(self, validated_data):
        raw_password = validated_data.pop('password', None)
        # Normalize security answers (trimmed and lowercase)
        for i in range(1, 4):
            key = f'security_answer_{i}'
            if key in validated_data and validated_data[key]:
                validated_data[key] = validated_data[key].strip().lower()
                
        instance = super().create(validated_data)
        if raw_password:
            instance.password = make_password(raw_password)
            instance.is_temp_password = True
            instance.save()
        return instance

    def update(self, instance, validated_data):
        raw_password = validated_data.pop('password', None)
        # Normalize security answers (trimmed and lowercase)
        for i in range(1, 4):
            key = f'security_answer_{i}'
            if key in validated_data:
                if validated_data[key]:
                    validated_data[key] = validated_data[key].strip().lower()
                else:
                    validated_data[key] = None

        instance = super().update(instance, validated_data)
        if raw_password:
            instance.password = make_password(raw_password)
            instance.is_temp_password = True
            instance.save()
        return instance


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


class AdminSettingsSerializer(serializers.Serializer):
    name = serializers.CharField(required=True)
    username = serializers.CharField(required=True)
    email = serializers.EmailField(required=True)
    current_password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    security_answer_1 = serializers.CharField(required=False, allow_blank=True, write_only=True)
    security_answer_2 = serializers.CharField(required=False, allow_blank=True, write_only=True)
    security_answer_3 = serializers.CharField(required=False, allow_blank=True, write_only=True)


class StaffSettingsSerializer(serializers.Serializer):
    name = serializers.CharField(required=True)
    email = serializers.EmailField(required=True)
    skills = serializers.CharField(required=False, allow_blank=True)
    current_password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    security_answer_1 = serializers.CharField(required=False, allow_blank=True, write_only=True)
    security_answer_2 = serializers.CharField(required=False, allow_blank=True, write_only=True)
    security_answer_3 = serializers.CharField(required=False, allow_blank=True, write_only=True)

