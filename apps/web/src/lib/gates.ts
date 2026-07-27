export const ACCESS_PATH = "/entrar";
export const LOGIN_PATH = "/login";
export const ONBOARDING_PATH = "/comecar";

// A ordem é a da entrada: acesso, sessão, carga. Uma tela de gate só devolve a advogada para um
// gate anterior ao dela, porque o erro que ela mesma produz é o assunto da tela, não uma sessão
// que venceu no meio do uso.
export const GATE_ORDER = [ACCESS_PATH, LOGIN_PATH, ONBOARDING_PATH];
