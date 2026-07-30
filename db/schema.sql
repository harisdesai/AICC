CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  github_url TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resumes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255),
  skills JSONB,
  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES resumes(id),
  target_role VARCHAR(100),
  difficulty VARCHAR(32) DEFAULT 'medium',
  status VARCHAR(32) DEFAULT 'active',
  overall_score NUMERIC,
  technical_score NUMERIC,
  comm_score NUMERIC,
  knowledge_gaps JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS session_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  sequence_num INT NOT NULL,
  topic TEXT,
  question_text TEXT,
  answer_text TEXT,
  answer_wpm INT,
  filler_count INT,
  technical_score NUMERIC,
  ai_feedback TEXT,
  answered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS emotion_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES session_questions(id) ON DELETE SET NULL,
  happy REAL,
  sad REAL,
  angry REAL,
  fearful REAL,
  surprised REAL,
  disgusted REAL,
  neutral REAL,
  dominant VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS github_repos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_name VARCHAR(255) NOT NULL,
  repo_url TEXT,
  description TEXT,
  readme_text TEXT,
  languages JSONB,
  stars INT DEFAULT 0,
  UNIQUE(user_id, repo_name)
);

CREATE TABLE IF NOT EXISTS system_configs (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_session ON session_questions(session_id);
