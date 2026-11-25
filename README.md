Appointment Booking Service
A bounded, conflict-safe scheduling service module implementing UTC-based appointment booking and cancellation with per-provider concurrency control.

Prerequisites
Node.js (v20 or later recommended)
npm
Setup & Running
npm install
npm test
To run the interactive terminal walkthrough:

npm start
Deliverables Overview
src/appointmentService.js — Core booking and cancellation service implementation.
src/demo.js — CLI demonstration exercising booking, overlap rejection, adjacency, cancellation, and UTC validation.
tests/appointmentService.test.js — Automated unit and concurrency test suite.
DESIGN.md — Service boundary, data contracts, overlap invariant, assumptions, and limitations.
AI_LOG.md — Record of AI prompts, engineering review decisions, and test verification output.
