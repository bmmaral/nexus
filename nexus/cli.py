#!/usr/bin/env python3
"""nexus - Dead simple project memory tool"""

import click
from nexus.main import Nexus


@click.group()
def cli() -> None:
    """Nexus - Project memory tool"""
    pass


@cli.command()
def init() -> None:
    """Initialize nexus in current repo"""
    Nexus().init()
    click.echo("✅ Nexus initialized!")


@cli.command(name='import-conv')
@click.argument('file')
@click.option('--platform', help='Platform (chatgpt/claude/gemini)')
def import_conv_cmd(file: str, platform: str | None) -> None:
    """Import conversation file (legacy alias)"""
    nexus = Nexus()
    nexus.import_conversation(file, platform)
    click.echo(f"✅ Imported {platform} conversation")
    click.echo(f"📌 Found {len(nexus.decisions)} decisions")


@cli.group(name='add')
def add_group() -> None:
    """Add resources to the project (conversations, modules)"""
    pass


@add_group.command(name='conversation')
@click.argument('file')
@click.option('--platform', help='Platform (chatgpt/claude/gemini)')
def add_conversation_cmd(file: str, platform: str | None) -> None:
    """Add (import) an AI conversation export file"""
    nexus = Nexus()
    nexus.import_conversation(file, platform)
    click.echo(f"✅ Imported {platform} conversation")
    click.echo(f"📌 Found {len(nexus.decisions)} decisions")


from nexus.analysis import analyze_diff, get_git_diff


@cli.command()
@click.argument('revision_range')
def analyze(revision_range: str) -> None:
    """Analyze a git revision range with AI."""
    diff = get_git_diff(revision_range)
    if not diff:
        click.echo("No changes detected in the given revision range.")
        return
    analysis = analyze_diff(diff)
    click.echo(analysis)


@cli.command()
def status() -> None:
    """Show project status"""
    Nexus().status()


@cli.command()
def timeline() -> None:
    """Update conversation timeline"""
    Nexus().update_timeline()
    click.echo("✅ Timeline updated: conversations/index.md")


@cli.command()
def check() -> None:
    """Check for inactive projects (for GitHub Action)"""
    Nexus().check_inactive()


@cli.command(name='remind')
def remind_cmd() -> None:
    """Check inactivity and print a human-readable reminder summary"""
    result = Nexus().check_inactive()
    if result.get('inactive'):
        days = result.get('days')
        last = (result.get('last_commit') or '').split('\n')[0]
        click.echo(
            f"⏰ Project inactive for {days} days. Last commit: {last}"
        )
        click.echo("Tip: Define a '## Next Steps' section in PRD.md for better reminders.")
    else:
        click.echo("✅ Project is active. No reminder needed.")


@cli.command(name='prd-summary')
def prd_summary_cmd() -> None:
    """Print PRD change summary for commit message"""
    summary = Nexus().prd_summary()
    if summary:
        click.echo(summary)


if __name__ == '__main__':
    cli()
