import * as React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { cn } from '../../lib/utils';

interface ChartData {
    value: number;
    color: string;
}

interface CircularProgressProps {
    data?: ChartData[];
    percentage?: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    backgroundColor?: string;
    showText?: boolean;
    className?: string;
}

export function CircularProgress({
    data,
    percentage = 0,
    size = 100,
    strokeWidth = 8,
    color = '#10B981', // green-500
    backgroundColor = '#374151', // gray-700
    showText = true,
    className
}: CircularProgressProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    
    // If no data is provided, use the percentage fallback (Backward compatibility)
    const renderData = data && data.length > 0 
        ? data 
        : [
            { value: percentage, color },
            { value: 100 - percentage, color: backgroundColor }
          ];

    const total = renderData.reduce((acc, curr) => acc + curr.value, 0);
    const actualTotal = total === 0 ? 1 : total; // Prevent division by zero
    
    let currentAngle = -90; // Start at top

    return (
        <View style={{ width: size, height: size }} className={cn("items-center justify-center", className)}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Background circle for safety */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={backgroundColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                
                {renderData.map((segment, index) => {
                    if (segment.value === 0) return null;
                    
                    const segmentPercentage = segment.value / actualTotal;
                    const strokeDasharray = `${circumference} ${circumference}`;
                    const strokeDashoffset = circumference - (segmentPercentage * circumference);
                    
                    const rotation = currentAngle;
                    // Pre-calculate next angle
                    currentAngle += segmentPercentage * 360;

                    return (
                        <G key={index} rotation={rotation} origin={`${size/2}, ${size/2}`}>
                            <Circle
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                stroke={segment.color}
                                strokeWidth={strokeWidth}
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap={renderData.length === 1 || segmentPercentage === 1 ? "round" : "butt"}
                                fill="none"
                            />
                        </G>
                    );
                })}
            </Svg>

            {showText && (
                <View className="absolute inset-0 items-center justify-center">
                    <Text className="text-white font-bold text-xl">{percentage}%</Text>
                </View>
            )}
        </View>
    );
}
