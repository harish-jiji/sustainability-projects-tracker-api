from rest_framework import viewsets
from .models import Project, Contributor, Task
from .serializers import ProjectSerializer, ContributorSerializer, TaskSerializer
from datetime import date

class ProjectViewSet(viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Projects.
    Supports filtering by status (e.g. ?status=Active).
    """
    serializer_class = ProjectSerializer

    def get_queryset(self):
        queryset = Project.objects.all().order_by('-created_at')
        status = self.request.query_params.get('status', None)
        if status:
            queryset = queryset.filter(status=status)
        return queryset


class ContributorViewSet(viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Contributors.
    """
    serializer_class = ContributorSerializer
    queryset = Contributor.objects.all().order_by('-joined_on')


class TaskViewSet(viewsets.ModelViewSet):
    """
    API endpoint for CRUD operations on Tasks.
    Supports filtering by contributor ID (?contributor=<id>) and overdue status (?overdue=true).
    """
    serializer_class = TaskSerializer

    def get_queryset(self):
        queryset = Task.objects.all().order_by('due_date')
        
        # Filter by contributor
        contributor = self.request.query_params.get('contributor', None)
        if contributor:
            queryset = queryset.filter(assigned_to_id=contributor)
        
        # Filter by overdue status
        overdue = self.request.query_params.get('overdue', None)
        if overdue is not None:
            if overdue.lower() == 'true':
                queryset = queryset.filter(is_completed=False, due_date__lt=date.today())
            elif overdue.lower() == 'false':
                # Either completed or not overdue
                queryset = queryset.exclude(is_completed=False, due_date__lt=date.today())
                
        return queryset
