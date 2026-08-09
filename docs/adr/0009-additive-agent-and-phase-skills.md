---
status: accepted
---

# Keep parent Skills when entering a Phase

ADR-0009 supersedes ADR-0008's replacement-only Phase visibility rule. Rowan
always executes a Phase with the active Agent Context Skills followed by that
Phase Bundle's concrete Skills; the implicit `default` Phase contributes no
additional Skills. Hosts may supply `AgentDefinition.bundledSkills` for
private parent-wide guidance, which Rowan keeps beside selector-selected Scope
Skills without giving the children independent Resource identity. The later
Bundle layer replaces a same-name Skill from the earlier layer.

This keeps universal guidance available in every Phase while preserving
progressive disclosure for Phase-local guidance.
