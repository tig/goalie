# GOALIE

GOALIE is a mechanism for setting, relating, and inspecting goals across an organization. It has two parts: a store that holds goals and makes them visible, and recurring reviews that make inspecting them routine.

It has been built and run at several companies. This repo formalizes it so it doesn't depend on any one organization or tool.

## What's here

- **[SPEC.md](SPEC.md)**: the GOALIE specification (draft 0.1). It covers:
  - principles and lexicon;
  - date types (Committed / Ambition / Fantasy) and the promotion rule;
  - severity vs. ranked priorities and starvation;
  - the data model and lifecycles;
  - views, fitness functions, and reviews;
  - human and agent responsibilities;
  - the required User's Manual;
  - configuration points;
  - requirements for an implementation.
- **[USERS_MANUAL.md](USERS_MANUAL.md)**: the User's Manual template (v0.1). An adopting organization copies it and fills it in. People and agents both work from it, and SPEC §11 requires one for every deployment.

## Status

The spec and manual are drafts. GOALIE will be built here as a self-contained product. Its first deployment is at Excaliwire.
