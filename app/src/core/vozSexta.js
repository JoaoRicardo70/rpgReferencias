// 🔊 Escolha da voz da Sexta-Feira (Web Speech API). Função pura: recebe a lista de vozes
// do navegador e devolve a melhor voz feminina em português, ou null se não houver nenhuma.

// Nomes das vozes femininas mais comuns (Windows/Edge, Chrome, macOS/iOS, Android).
const NOMES_FEMININOS = ['francisca', 'maria', 'thalita', 'luciana', 'vitoria', 'vitória', 'leila', 'manuela', 'yara', 'brenda', 'elza', 'giovanna', 'leticia', 'letícia', 'raquel', 'joana', 'catarina', 'fernanda', 'helena', 'female', 'feminina', 'mulher'];
// Vozes masculinas conhecidas: nunca são escolhidas.
const NOMES_MASCULINOS = ['daniel', 'antonio', 'antônio', 'ricardo', 'felipe', 'donato', 'fabio', 'fábio', 'julio', 'júlio', 'nicolau', 'valerio', 'valério', 'humberto', 'duarte', 'male', 'masculina', 'homem'];

// Tom levemente mais agudo, usado só quando o navegador não tem nenhuma voz feminina.
export const TOM_SEM_VOZ_FEMININA = 1.25;

// Compara palavras inteiras do nome (senão "male" casaria dentro de "female").
const contem = (nome, lista) => {
    const palavras = nome.split(/[^a-zà-ú]+/i);
    return lista.some(n => palavras.includes(n));
};

export function escolherVozFeminina(vozes) {
    if (!Array.isArray(vozes) || !vozes.length) return null;
    const pt = vozes.filter(v => v && typeof v.lang === 'string' && v.lang.toLowerCase().replace('_', '-').startsWith('pt'));
    const nome = (v) => String(v.name || '').toLowerCase();
    const ehBR = (v) => v.lang.toLowerCase().replace('_', '-') === 'pt-br';
    const femininas = pt.filter(v => contem(nome(v), NOMES_FEMININOS) && !contem(nome(v), NOMES_MASCULINOS));
    // A voz "Google português do Brasil" do Chrome é feminina.
    const google = pt.filter(v => nome(v).includes('google') && !contem(nome(v), NOMES_MASCULINOS));
    const ordem = [
        femininas.filter(ehBR).find(v => nome(v).includes('online') || nome(v).includes('natural')),
        femininas.find(ehBR),
        google.find(ehBR),
        femininas[0],
        google[0],
    ];
    return ordem.find(Boolean) || null;
}

// Aplica a voz feminina numa fala; sem voz feminina, deixa o tom mais agudo.
export function configurarFalaSexta(fala, vozes) {
    fala.lang = 'pt-BR';
    const voz = escolherVozFeminina(vozes);
    if (voz) { fala.voice = voz; fala.lang = voz.lang; } else fala.pitch = TOM_SEM_VOZ_FEMININA;
    return fala;
}

// 🎤 Junta o que foi falado ao que já estava digitado no campo.
export function juntarTextoFalado(digitado, falado) {
    const a = String(digitado || '').trim();
    const b = String(falado || '').trim();
    return a && b ? `${a} ${b}` : (a || b);
}

// 🎤 Aviso para cada erro do reconhecimento de voz do navegador.
export function mensagemErroMicrofone(erro) {
    switch (erro) {
        case 'not-allowed':
        case 'service-not-allowed':
            return 'O navegador bloqueou o microfone. Permita o acesso ao microfone para este site e tente de novo.';
        case 'no-speech': return 'Não ouvi nada. Clique no 🎤 e fale logo em seguida.';
        case 'audio-capture': return 'Nenhum microfone encontrado.';
        case 'network': return 'O reconhecimento de voz não respondeu. Confira a internet; no app desktop ele não funciona, use o site no Chrome ou no Edge.';
        case 'language-not-supported': return 'Este navegador não reconhece fala em português.';
        default: return 'Não foi possível usar o microfone agora.';
    }
}
