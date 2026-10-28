// ==========================================
// 🗺️ FRONTEIRAS PADRÃO DO MAPA DA TERRA 0
// Cada região do mapa começa com seu território: uma facção por região, desenhadas a partir dos realces do mapa.
// Vale até o Mestre editar as fronteiras (aí o que ele salvou, marcado com "personalizado", passa a valer).
// ==========================================
import { GRADE_L, GRADE_A, CORES_FACCOES, facoesDeFirebase, gradeDeFirebase } from './fronteiras';
import { LINHAS_PADRAO } from './fronteirasPadraoDados';

const NOMES_PADRAO = ['Freljord', 'Demacia', 'Noxus', 'Piltover e Zaun', 'Shurima', 'Targon', 'Ixtal', 'Águas de Sentina', 'Ionia', 'Ilha das Sombras'];

export const FACCOES_PADRAO = NOMES_PADRAO.map((nome, i) => ({ id: '123456789abc'[i], nome, cor: CORES_FACCOES[i] }));

function decodificarLinha(codigo) {
    let linha = '';
    codigo.split(',').forEach((parte) => { linha += parte[0].repeat(Number(parte.slice(1))); });
    return linha;
}

let gradeEmCache = null;
// Grade padrão (as linhas são imutáveis, então o mesmo array pode ser reaproveitado).
export function gradePadrao() {
    if (!gradeEmCache) gradeEmCache = LINHAS_PADRAO.slice(0, GRADE_A).map((codigo) => decodificarLinha(codigo).slice(0, GRADE_L).padEnd(GRADE_L, '0'));
    return gradeEmCache;
}

export function fronteirasPadrao() {
    return { facoes: FACCOES_PADRAO, grade: gradePadrao() };
}

// Fronteiras a mostrar: as do Mestre se ele já editou; senão o padrão.
export function fronteirasDoCenario(bruto) {
    if (bruto && typeof bruto === 'object' && bruto.personalizado === true) {
        const facoes = facoesDeFirebase(bruto.facoes);
        return { facoes, grade: gradeDeFirebase(bruto.linhas, facoes) };
    }
    return fronteirasPadrao();
}
