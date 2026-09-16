'use client';

import {
  ResponsiveContainer, RadarChart, PolarGrid,
  PolarAngleAxis, Radar, Legend
} from 'recharts';

interface RadarData {
  category: string;
  score: number;
}

interface Props {
  data: RadarData[];
}

export function SkillRadarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="category" />
        <Radar
          name="Interview Score"
          dataKey="score"
          stroke="#005587"
          fill="#005587"
          fillOpacity={0.5}
        />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  );
}
