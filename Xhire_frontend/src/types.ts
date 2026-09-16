// file: Xhire_frontend/src/types.ts

// --- Auth Types ---
export interface User {
  email: string;
  full_name: string;
  role: string;
}

// --- Recruiter Dashboard Types ---
export interface Requisition {
  id: number;
  title: string;
  jd_text: string;
  ats_id: string | null;
  status: string;
  owner_id: number;
  candidate_count?: number;
  completed_count?: number;
  in_progress_count?: number;
  invited_count?: number;
}

export interface RequisitionCreate {
  title: string;
  jd_text: string;
  ats_id?: string;
}

// --- Candidate & Session Types ---
export interface Candidate {
  id: number;
  email: string;
  full_name: string;
  cv_text: string;
}

export interface InterviewSession {
  id: number;
  session_uuid: string;
  status: string;
  access_code: string;
  requisition_id: number;
  candidate_id: number;
  scheduled_at?: string | null;
  scheduled_timezone?: string | null;
  ai_integrity_score?: number | null;
  is_ai_flagged?: boolean;
  dar_data: {
    resume_assessment?: ResumeAssessment | null;
    synthesis?: {
      final_score?: number;
      recommendation?: string;
    } | null;
    audit?: {
      ai_integrity?: {
        overall_integrity_score?: number;
        is_flagged?: boolean;
        evaluated_answers_count?: number;
        flagged_answers_count?: number;
        verdict?: string;
      };
      safety_violations?: any[];
    } | null;
  };
  candidate: Candidate;
}

export interface ScheduleSlot {
  slot_id: string;
  datetime_iso: string;
  time_label: string;
  period: string;
  duration_minutes: number;
}

export interface ScheduleDay {
  date: string;
  day_label: string;
  slots: ScheduleSlot[];
}

export interface ScheduleInfo {
  session_uuid: string;
  candidate_name: string;
  candidate_email: string;
  requisition_title: string;
  access_code: string;
  scheduled_at?: string | null;
  scheduled_timezone?: string;
  available_days: ScheduleDay[];
}

export interface BookSlotResponse {
  message: string;
  session_uuid: string;
  scheduled_at: string;
  scheduled_timezone: string;
  google_calendar_url: string;
  ics_download_url: string;
  interview_url: string;
}

export interface AIDetectionResult {
  ai_probability: number;
  is_flagged: boolean;
  human_likeness_score: number;
  perplexity: number;
  burstiness: number;
  sentence_count: number;
  avg_sentence_length: number;
  flags: string[];
  verdict: string;
}

// --- Requisition Details Page Type ---
export interface RequisitionDetails extends Requisition {
  interview_sessions: InterviewSession[];
}

// --- HM Report Types (from dar3_schemas.py) ---
export interface ResumePillarScore {
  pillar: string;
  score: number;
  rationale: string;
}

export interface ResumeAssessment {
  suitability_index: number;
  verdict: string;
  pillar_scores: ResumePillarScore[];
}

export interface Synthesis {
  final_score: number | null;
  summary: string | null;
  safety_summary: string | null;
  resume_assessment: ResumeAssessment | null;
  performance_gap: number | null;
  radar_data: { [key: string]: number };
  heatmap_data: any[];
  depth_data: { category: string; max_depth: number }[];
  fidelity_data: any[];
}

export interface DAR {
  meta: {
    interview_id: string;
    candidate_name: string;
    timestamps: {
      created: number;
      interview_start: number;
      round_start: number;
    };
    routing: {
      current_round: string | null;
      round_order: string[];
      next_node_override: string | null;
    };
    ui: {
      message_for_user: string | null;
      paused_by_human: boolean;
    };
  };
  resume_assessment: ResumeAssessment;
  inputs: {
    jd_text: string;
    cv_text: string;
  };
  constraints: any;
  categories: any;
  interview_log: any[];
  synthesis: Synthesis;
  audit: any;
  errors: string[];
}

export interface CandidateMetric {
  session_uuid: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  overall_score: number;
  percentile: number;
  rank: number;
  scores: Record<string, number>;
  percentiles: Record<string, number>;
  radar_data: { category: string; score: number }[];
  ai_integrity_score: number;
  is_ai_flagged: boolean;
}

export interface CandidateMatrixResponse {
  requisition_id: number;
  requisition_title: string;
  total_candidates: number;
  completed_candidates: number;
  radar_categories: string[];
  leaderboard: CandidateMetric[];
  category_averages: Record<string, number>;
  top_strengths: Record<string, string>;
}

export interface AutoTuneJDRequest {
  raw_requirements: string;
  seniority: string;
  focus_areas?: string[];
}

export interface AutoTuneJDResponse {
  title: string;
  calibrated_seniority: string;
  summary: string;
  responsibilities: string[];
  required_skills: string[];
  nice_to_have: string[];
  rubrics: Record<string, { criteria: Record<string, number> }>;
  curated_questions: Record<string, string[]>;
}