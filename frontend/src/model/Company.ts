export interface MaterialExposure {

    id: string;

    name: string;

    costPercent: number;
}

export interface Company {

    id: string;

    name: string;

    stockCode: string;

    industry: string;

    business: string;

    chainPosition: string;

    materials: MaterialExposure[];

    riskLevel: "low" | "medium" | "high";

}