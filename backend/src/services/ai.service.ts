import { generateCaption } from './ai/caption.service';
import { detectObjects, DetectionSummary } from './ai/detection.service';
import { classifySafety, SafetyResult } from './ai/safety.service';

export interface ImageAnalysisResult {
  labels: string[];
  flagged: boolean;
  flagCategory: string | null;
}

export class AIService {
  static generateCaption(localFilePath: string): Promise<string> {
    return generateCaption(localFilePath);
  }

  static detectObjects(localFilePath: string): Promise<DetectionSummary> {
    return detectObjects(localFilePath);
  }

  static classifySafety(localFilePath: string): Promise<SafetyResult> {
    return classifySafety(localFilePath);
  }

  static async analyzeImage(localFilePath: string): Promise<ImageAnalysisResult> {
    const detectionResults = await detectObjects(localFilePath);
    const safetyResults = await classifySafety(localFilePath);

    return {
      labels: detectionResults.labels,
      flagged: safetyResults.flagged,
      flagCategory: safetyResults.flagCategory
    };
  }
}

export default AIService;
