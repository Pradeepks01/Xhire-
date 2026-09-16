'use client';

import {
  ResponsiveContainer, BarChart, XAxis,
  YAxis, Tooltip, Bar, CartesianGrid
} from 'recharts';
import { DEPTH_LABEL } from '../constants';

interface DepthData {
  category: string;
  max_depth: number;
}

interface Props {
  data: DepthData[];
}

const formatYAxis = (tick: string) => {
  return tick.length > 15 ? `${tick.substring(0, 15)}...` : tick;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const depth = payload[0].value;
    return (
      <div className="custom-tooltip">
        <p className="label">{`${label}`}</p>
        <p className="intro">{`Max Depth: ${DEPTH_LABEL[depth] || depth}`}</p>
      </div>
    );
  }
  return null;
};

export function DepthBarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart layout="vertical" data={data} margin={{ left: 30, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 3]} ticks={[1, 2, 3]} tickFormatter={(d) => `L${d}`} />
        <YAxis
          dataKey="category"
          type="category"
          width={100}
          tickFormatter={formatYAxis}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="max_depth" fill="#44D62C" />
      </BarChart>
    </ResponsiveContainer>
  );
}
