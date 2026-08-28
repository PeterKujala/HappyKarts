# Kart Board hosted MVP

This directory contains the OpenAI Sites deployment of Kart Board. It keeps the original public board and controller experience while replacing local file storage and process-local events with durable D1 state and efficient revision-based polling.

## Architecture

- Vinext/Next route handlers compiled to a Cloudflare Worker-compatible bundle.
- One D1 row stores the complete versioned practice-day state.
- Optimistic concurrency prevents two controllers from silently overwriting each other.
- Public board reads use revision ETags to avoid transferring unchanged state.
- Controller mutations require a long random access code stored only as a hosted runtime secret.

## Local development

Copy `.env.example` to `.env.local`, choose a controller access code, then run the development script. Open `/board.html` for the public display and `/control.html` for the protected controller.
