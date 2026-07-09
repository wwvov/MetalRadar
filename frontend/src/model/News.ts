export interface News {

    id: string;

    title: string;

    publishTime: string;

    source: string;

    emotion: "positive" | "neutral" | "negative";

    materials: string[];

}