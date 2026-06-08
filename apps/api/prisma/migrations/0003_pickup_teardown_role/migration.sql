-- Add an operational role for pickup/tear-down assignments.
ALTER TYPE "AssignmentRole" ADD VALUE IF NOT EXISTS 'pickup_teardown';
