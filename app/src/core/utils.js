// ==========================================
// UTILITÁRIOS PUROS — Zero dependências
// ==========================================

export function contarDigitos(v) {
    if (!v || isNaN(v) || v <= 0) return 0;
    return Math.floor(Math.log10(v)) + 1;
}

export function tratarUnico(t) {
    if (!t) return [1.0];
    let arr = String(t).split(',');
    let nums = [];
    for (let i = 0; i < arr.length; i++) {
        let n = parseFloat(arr[i].trim());
        if (!isNaN(n)) nums.push(n);
    }
    return nums.length ? nums : [1.0];
}

export function pegarDoisPrimeirosDigitos(v) {
    let n = Math.floor(Math.abs(v || 0));
    if (n === 0) return 0;
    
    // 🔥 FIM DO GARGALO DA EVASIVA 🔥
    // A partir de 1000, o Acerto e a CA escalam na perfeição (ex: 21.000 = +21 | 421.000 = +421)
    if (n >= 1000) return Math.floor(n / 1000);
    
    let str = String(n);
    if (str.includes('e')) {
        const firstNums = str.split('e')[0].replace('.', '');
        return parseInt(firstNums.substring(0, 2).padEnd(2, '0'));
    }
    
    if (n <= 100) return n;
    return parseInt(str.substring(0, 2));
}

// 🔥 MIGRAÇÃO: converte itens legados de ficha.passivas[] (escritos pela extinta aba
// "Ficha Narrativa" — ver NarrativaFormContext.jsx) para o formato de ficha.poderes[]
// usado pela aba Habilidades/Formas/Poderes do Grimório atual. Sem essa migração, esses
// itens continuam sendo computados no cálculo (attributes.js ainda lê ficha.passivas),
// mas ficam presos sem nenhuma UI de edição, já que a aba que os criava foi removida.
export function migrarPassivasParaPoderes(passivas) {
    if (!Array.isArray(passivas) || passivas.length === 0) return [];
    // 🔥 id inclui um sufixo aleatório (além de Date.now()+índice) para não colidir
    // caso a migração rode mais de uma vez dentro do mesmo milissegundo (ex: duas
    // chamadas de carregarDadosFicha em sequência rápida antes do persist-back salvar
    // a ficha já migrada e limpar ficha.passivas).
    return passivas.map((p, i) => ({
        id: `legado_passiva_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        nome: p?.nome || 'Habilidade sem nome',
        descricao: '',
        vertente: '',
        elemento: '',
        elementosAfetados: '',
        categoria: 'habilidade',
        ativa: false,
        efeitos: [],
        efeitosPassivos: Array.isArray(p?.efeitos) ? p.efeitos : [],
        imagemUrl: '',
        dadosQtd: 0,
        dadosFaces: 20,
        custoPercentual: 0,
        alcance: 1,
        area: 0,
        armaVinculada: ''
    }));
}

// ==========================================
// 🔥 SINCRONIZAÇÃO MULTIPLAYER (diff parcial + merge 3 vias) 🔥
// ==========================================
function ehObjetoPlano(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// 🔥 Calcula só os campos que mudaram entre `anterior` (último estado confirmado
// no Firebase) e `atual` (ficha local a salvar), como um mapa de caminhos
// "chave/subchave" -> valor pronto para `update()`. Substitui o antigo `set()`
// da ficha inteira: dois jogadores/abas editando campos DIFERENTES da mesma
// ficha não se esmagam mais, porque cada save só escreve os campos que
// realmente mudaram localmente, e não a ficha inteira. Recursa em objetos
// simples (aninhados a qualquer profundidade); arrays (poderes, inventario,
// condicoes etc.) são tratados como valor atômico — sem diff por item.
export function calcularDiffFirebase(anterior, atual, prefixo = '') {
    const updates = {};
    const anteriorObj = ehObjetoPlano(anterior) ? anterior : {};
    const atualObj = ehObjetoPlano(atual) ? atual : {};
    const chaves = new Set([...Object.keys(anteriorObj), ...Object.keys(atualObj)]);
    for (const chave of chaves) {
        const valorAnterior = anteriorObj[chave];
        const valorAtual = atualObj[chave];
        const caminho = prefixo ? `${prefixo}/${chave}` : chave;
        if (ehObjetoPlano(valorAtual) && ehObjetoPlano(valorAnterior)) {
            Object.assign(updates, calcularDiffFirebase(valorAnterior, valorAtual, caminho));
        } else if (JSON.stringify(valorAnterior) !== JSON.stringify(valorAtual)) {
            updates[caminho] = valorAtual === undefined ? null : valorAtual;
        }
    }
    return updates;
}

// 🔥 Mescla uma atualização remota (`remoto`, o que acabou de chegar do
// Firebase) com a ficha local (`local`), usando `base` (o último estado
// confirmado do Firebase antes desta atualização) para decidir quem venceu
// campo a campo: se o valor local ainda é IGUAL ao `base`, o jogador não
// mexeu nele desde a última sincronização, então o valor remoto pode entrar
// livremente — inclusive um `undefined` remoto genuíno (a chave foi REMOVIDA
// no Firebase, ex: o Mestre apagou uma proficiência/domínio pelo Painel), que
// também precisa ser propagado, senão o próximo save local ressuscitaria a
// chave que acabou de ser apagada por outra pessoa. Se o valor local já MUDOU
// em relação ao `base` (edição não salva ainda, incluindo o caso de o
// jogador ter acabado de CRIAR essa chave localmente, então ainda ausente
// tanto no `base` quanto no `remoto`), o local vence, para nunca apagar o
// que o jogador acabou de digitar. Mesma regra de recursão de
// calcularDiffFirebase (objetos simples recursam, arrays são atômicos).
export function mesclarComRemoto(base, local, remoto) {
    if (ehObjetoPlano(remoto) && ehObjetoPlano(local)) {
        const baseObj = ehObjetoPlano(base) ? base : {};
        const resultado = { ...local };
        const chaves = new Set([...Object.keys(remoto), ...Object.keys(local)]);
        for (const chave of chaves) {
            const valorMesclado = mesclarComRemoto(baseObj[chave], local[chave], remoto[chave]);
            if (valorMesclado === undefined) delete resultado[chave];
            else resultado[chave] = valorMesclado;
        }
        return resultado;
    }
    const alteradoLocalmente = JSON.stringify(local) !== JSON.stringify(base);
    return alteradoLocalmente ? local : remoto;
}

export function isFisico(s) {
    return ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaesp', 'carisma', 'stamina', 'constituicao'].includes(s.toLowerCase());
}

export function isEnergia(s) {
    return ['mana', 'aura', 'chakra', 'corpo'].includes(s.toLowerCase());
}

// ==========================================
// 🌌 FORMATADOR DE POWER LEVEL (ESCALA DIVINA)
// ==========================================
export function formatarPoderCosmico(valor) {
    if (valor === undefined || valor === null || valor === '') return "0";

    let strVal = String(valor).trim().toLowerCase();
    let baseNum = 0;
    let expoente = 0;

    if (strVal.includes('e')) {
        const parts = strVal.split('e');
        baseNum = parseFloat(parts[0]);
        expoente = parseInt(parts[1].replace('+', ''));
    } else {
        const valLimpo = strVal.replace(/[^0-9]/g, '');
        if (valLimpo.length <= 6) return Number(valor).toLocaleString('pt-BR');
        
        expoente = valLimpo.length - 1;
        const digits = valLimpo.substring(0, 5); 
        baseNum = parseFloat(digits) / Math.pow(10, digits.length - 1); 
    }

    if (expoente < 6) return Number(valor).toLocaleString('pt-BR');

    const sufixos = [
        { lim: 36, nome: ' Undecilhões' },
        { lim: 33, nome: ' Decilhões' },
        { lim: 30, nome: ' Nonilhões' },
        { lim: 27, nome: ' Octilhões' },
        { lim: 24, nome: ' Septilhões' },
        { lim: 21, nome: ' Sextilhões' },
        { lim: 18, nome: ' Quintilhões' },
        { lim: 15, nome: ' Quatrilhões' },
        { lim: 12, nome: ' Trilhões' },
        { lim: 9,  nome: ' Bilhões' },
        { lim: 6,  nome: ' Milhões' }
    ];

    for (let i = 0; i < sufixos.length; i++) {
        if (expoente >= sufixos[i].lim) {
            const diff = expoente - sufixos[i].lim;
            const valorFinal = baseNum * Math.pow(10, diff);
            let formatado = valorFinal % 1 === 0 
                ? valorFinal.toLocaleString('pt-BR') 
                : valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
            return `${formatado}${sufixos[i].nome}`;
        }
    }
    return Number(valor).toLocaleString('pt-BR');
}