import os
import openai
import git


def get_git_diff(revision_range):
    """
    Get the git diff for a given revision range.
    """
    repo = git.Repo('.')
    diff = repo.git.diff(revision_range)
    return diff


def analyze_diff(diff):
    """
    Analyze the git diff using the OpenRouter API.
    """
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        raise ValueError('OPENROUTER_API_KEY environment variable not set.')

    client = openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    response = client.chat.completions.create(
        model="google/gemini-pro",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior software engineer performing a concise code review. "
                    "Analyze the following git diff and provide a compact, professional summary. "
                    "Your response should be in Markdown and include the following sections:\n\n"
                    "1.  **Summary:** A brief, high-level overview of the changes.\n"
                    "2.  **Code Quality:** A bulleted list of specific, actionable suggestions for improvement.\n"
                    "3.  **Security:** A brief assessment of any potential security vulnerabilities.\n"
                    "4.  **PRD Alignment:** A short statement on how the changes align with the PRD."
                ),
            },
            {
                "role": "user",
                "content": diff,
            },
        ],
    )
    return response.choices[0].message.content
