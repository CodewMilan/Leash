export const schema = `
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS design text NOT NULL DEFAULT 'diwali';
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS sealed_message text;
`;
