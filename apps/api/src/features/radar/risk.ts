// O limiar é chute informado, não regra do CPC: sessenta dias corridos é o ponto em que a advogada
// olharia o processo por conta própria. Precisa passar por ela antes de virar número definitivo.
export const SILENCE_THRESHOLD_DAYS = 60;

// Conclusão pesa mais porque o silêncio ali significa que o processo está na mesa do juiz e nada
// voltou: é o vazio que a advogada mais precisa ver.
export const CONCLUSION_WEIGHT = 1.5;
