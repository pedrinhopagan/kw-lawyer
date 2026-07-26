export const TEST_ACCESS_USER = "pedro-de-teste";
export const TEST_ACCESS_PASSWORD = "senha-de-teste";

process.env.ACCESS_USER = TEST_ACCESS_USER;
process.env.ACCESS_PASSWORD = TEST_ACCESS_PASSWORD;

// O default do observability é um arquivo SQLite no diretório de trabalho. Duas passadas da suíte
// encostadas disputam o mesmo arquivo e caem com SQLITE_BUSY em testes que nada afirmam sobre
// observabilidade. Cada processo de teste grava na própria memória: o caminho de escrita continua
// exercitado, sem arquivo para disputar.
process.env.OBSERVABILITY_DB_PATH = ":memory:";
