import pytest
from unittest.mock import MagicMock, patch
from groq import AuthenticationError, APIConnectionError
from app.services.groq_service import validate_groq_key, analyze_resume_profile, GroqServiceError


def test_validate_groq_key_success():
    with patch("app.services.groq_service.Groq") as mock_groq_cls:
        mock_instance = MagicMock()
        mock_groq_cls.return_value = mock_instance
        mock_instance.models.list.return_value = []
        
        assert validate_groq_key("gsk_valid_key_123") is True


def test_validate_groq_key_auth_failure():
    with patch("app.services.groq_service.Groq") as mock_groq_cls:
        mock_instance = MagicMock()
        mock_groq_cls.return_value = mock_instance
        mock_instance.models.list.side_effect = AuthenticationError(
            message="Invalid API Key",
            response=MagicMock(status_code=401),
            body=None
        )
        
        with pytest.raises(GroqServiceError, match="Invalid Groq API key"):
            validate_groq_key("gsk_invalid_key")


def test_analyze_resume_profile_success():
    with patch("app.services.groq_service.Groq") as mock_groq_cls:
        mock_instance = MagicMock()
        mock_groq_cls.return_value = mock_instance
        
        mock_choice = MagicMock()
        mock_choice.message.content = '{"target_role": "Platform Engineer", "key_skills": ["Kubernetes", "Go"], "suggested_topics": ["Distributed Systems", "Networking"]}'
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        mock_instance.chat.completions.create.return_value = mock_resp

        result = analyze_resume_profile("gsk_key", "Resume text sample")
        assert result["target_role"] == "Platform Engineer"
        assert "Kubernetes" in result["target_skills"]
        assert "Distributed Systems" in result["target_topics"]


def test_analyze_resume_profile_failure_handling():
    with patch("app.services.groq_service.Groq") as mock_groq_cls:
        mock_instance = MagicMock()
        mock_groq_cls.return_value = mock_instance
        mock_instance.chat.completions.create.side_effect = APIConnectionError(request=MagicMock())

        with pytest.raises(GroqServiceError, match="Groq API error"):
            analyze_resume_profile("gsk_key", "Resume text")
