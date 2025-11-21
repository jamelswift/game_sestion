export class Career {
  id: number;
  name: string;
  salary: number;
  startingCash: number;
  description?: string;
}

// Marker export to ensure this file is recognized as a module in all build environments
export const __isCareerEntityModule = true;
