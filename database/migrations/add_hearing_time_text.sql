-- Add hearing_time_text column to store original hearing time strings
-- This allows storing complex time descriptions like "4:30 PM or upon adjournment"
-- while hearing_time stores the parsed time value (or NULL if unparseable)

ALTER TABLE bill_hearings
ADD COLUMN IF NOT EXISTS hearing_time_text TEXT;

-- Add comment explaining the columns
COMMENT ON COLUMN bill_hearings.hearing_time IS 'Parsed time in HH:MM:SS format (NULL if unparseable)';
COMMENT ON COLUMN bill_hearings.hearing_time_text IS 'Original hearing time string from source (e.g., "4:30 PM or upon adjournment")';
