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