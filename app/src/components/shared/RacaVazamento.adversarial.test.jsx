import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import useStore from '../../stores/useStore';
import DominioRacialFicha from './DominioRacialFicha';
import ComposicaoRacialFicha from './ComposicaoRacialFicha';
import SeletorRacaDaFicha from './SeletorRacaDaFicha';
import SeletorRaca from './SeletorRaca';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import { ResumoDominioRacial, DominioHabilidadeRaca } from '../poderes/RacaPoderControles';
import DisponiveisBiblioteca from '../poderes/DisponiveisBiblioteca';
import RacasAcessoCampo from '../poderes/RacasAcessoCampo';
import {
    VIEWER_DONO_JOGADOR, VIEWER_MESTRE, VIEWER_OUTRO_JOGADOR, habilidadeRevelaRaca, motivoSemAcessoVisivel, poderBloqueadoVisivel,
    poderBloqueadoParaDono, mascararTextoRaca, visivelPara,
} from '../../core/racasVisibilidade';
import { criarEntradaDePoder } from '../../core/bibliotecaRacial';
import { verificarAcessoHabilidadeRaca } from '../../core/racasAcesso';
import { montarContextoFicha } from '../../core/sextaFeira';
import { resumoFichaDetalhado, executarFerramenta, montarContextoInicial } from '../../core/sextaFeiraFerramentas';
import * as sync from '../../services/firebase-sync';
import * as svc from '../../services/composicaoRacial';
import { definirRacaDoPersonagemDireto } from '../../services/racasMesa';

vi.mock('../../services/firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)), salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(), salvarFichaAlvoImediato: vi.fn(),
    salvarFirebaseImediato: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

// ---------- cenário ----------
const RACAS = [
    { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: ['Sayajin'], herdaDe: '' },
    { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' },
    { id: 'namekuseijin', nome: 'Namekuseijin', icone: '🟢', apelidos: [], herdaDe: '' },
];
const CENARIO = { racas: RACAS };
const zenkai = { id: 7, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: 80, efeitos: [] };
const genki = { id: 8, nome: 'Genki', categoria: 'habilidadeRaca', racasAcesso: ['namekuseijin'], efeitos: [] };
const ENTIDADE = { id: 'Kai', nome: 'Kai' };

const fichaCom = (vis, extraBio = {}) => ({
    bio: {
        raca: 'Saiyajin', racaId: 'saiyajin', classe: 'Guerreiro',
        composicaoRacial: [{ racaId: 'saiyajin', percentual: 70, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }],
        ...(vis ? { racaVisibilidade: vis } : {}), ...extraBio,
    },
    poderes: [],
});
// Variantes: 'publica' = ficha SEM racaVisibilidade (comportamento antigo).
const FICHAS = { secreta: () => fichaCom({ saiyajin: 'secreta' }), privada: () => fichaCom({ saiyajin: 'privada' }), publica: () => fichaCom(null) };
const NIVEIS = ['secreta', 'privada', 'publica'];
const VIEWERS = ['dono', 'outro', 'mestre'];
const podeVer = (nivel, v) => v === 'mestre' || nivel === 'publica' || (nivel === 'privada' && v === 'dono');

const CTX = {
    dono: { isMestre: false, meuNome: 'Kai', viewer: VIEWER_DONO_JOGADOR, alvo: false },
    outro: { isMestre: false, meuNome: 'Outro', viewer: VIEWER_OUTRO_JOGADOR, alvo: true },
    mestre: { isMestre: true, meuNome: 'Mestre', viewer: VIEWER_MESTRE, alvo: true },
};
function preparar(v, ficha, extra = {}) {
    const c = CTX[v];
    useStore.setState({
        isMestre: c.isMestre, souMestreReal: c.isMestre, modoJogador: false, meuNome: c.meuNome, cenario: CENARIO,
        minhaFicha: v === 'dono' ? ficha : { bio: { raca: 'Humano', racaId: 'humano' }, poderes: [] },
        personagens: v === 'dono' ? {} : { Kai: ficha }, ...extra,
    });
}
const envolver = (v, ui) => (CTX[v].alvo ? <FichaAlvoProvider nome="Kai">{ui}</FichaAlvoProvider> : ui);

// Tudo que o usuário pode ler/inspecionar: HTML (inclui title/aria-label/placeholder/alt/data-*), valores de campos e texto.
function despejo() {
    const partes = [document.body.innerHTML, document.body.textContent];
    document.body.querySelectorAll('input,select,textarea').forEach((el) => partes.push(`[value=${el.value}]`));
    return partes.join('\n');
}
const RE_RACA = /Saiyajin|Sayajin/i;
const RE_DOMINIO = /(?<![\d.,])70(?:\.0+)?\s*%|percentual\W{1,4}70\b|Dom[ií]nio\D{0,25}\b70\b|\[value=70\]/i;
const vaza = (s) => RE_RACA.test(s) || RE_DOMINIO.test(s);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, souMestreReal: false, modoJogador: false, cenario: {}, personagens: {} }); });

// ---------- 1. matriz de renderização: cada ponto da UI × viewer × nível ----------
const PONTOS = [
    ['DominioRacialFicha', () => <DominioRacialFicha />],
    ['ComposicaoRacialFicha', () => <ComposicaoRacialFicha />],
    ['SeletorRacaDaFicha (campo Raça)', () => <SeletorRacaDaFicha valor="Saiyajin" aoMudar={() => {}} variante="ficha" />],
    ['SeletorRacaDaFicha padrão (Narrativa)', () => <SeletorRacaDaFicha valor="Saiyajin" aoMudar={() => {}} />],
    ['ResumoDominioRacial', ({ viewer, ficha }) => <ResumoDominioRacial cenario={CENARIO} ficha={ficha} viewer={viewer} />],
    ['DominioHabilidadeRaca (Domínio insuficiente)', ({ viewer, ficha, isMestre }) => <DominioHabilidadeRaca poder={zenkai} ficha={ficha} cenario={CENARIO} entidade={ENTIDADE} isMestre={isMestre} viewer={viewer} />],
    ['RacasAcessoCampo (como o Grimório liga o ocultar)', ({ viewer, ficha, isMestre }) => <RacasAcessoCampo poder={zenkai} cenario={CENARIO} podeEditar={isMestre} ocultar={habilidadeRevelaRaca(CENARIO, ficha, zenkai, viewer)} aoMudar={() => {}} />],
    ['DisponiveisBiblioteca', ({ viewer, ficha, isMestre }) => {
        const entrada = criarEntradaDePoder({ nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'], percentualMinimo: 80 }, { resumo: 'Cresce', agora: 1 }).entrada;
        return <DisponiveisBiblioteca cenario={{ racas: RACAS, bibliotecaRacial: [entrada] }} ficha={ficha} entidade={ENTIDADE} isMestre={isMestre} viewer={viewer} />;
    }],
];
// O que deve aparecer para quem PODE ver (prova que o teste não passa por estar vazio).
const POSITIVO = {
    DominioRacialFicha: /Saiyajin/, ComposicaoRacialFicha: /Saiyajin/, 'SeletorRacaDaFicha (campo Raça)': /Saiyajin/, 'SeletorRacaDaFicha padrão (Narrativa)': /Saiyajin/,
    ResumoDominioRacial: /Saiyajin/, 'DominioHabilidadeRaca (Domínio insuficiente)': /Saiyajin 70%/, 'RacasAcessoCampo (como o Grimório liga o ocultar)': /Saiyajin/, DisponiveisBiblioteca: /Zenkai/,
};

describe.each(NIVEIS)('Vazamento na UI: Raça %s', (nivel) => {
    describe.each(VIEWERS)('viewer %s', (v) => {
        it.each(PONTOS)('%s', (nome, ui) => {
            const ficha = FICHAS[nivel]();
            preparar(v, ficha);
            const c = CTX[v];
            render(envolver(v, ui({ viewer: c.viewer, ficha, isMestre: c.isMestre })));
            const txt = despejo();
            if (podeVer(nivel, v)) {
                expect(txt).toMatch(POSITIVO[nome]);
            } else {
                const achados = (txt.match(new RegExp(`${RE_RACA.source}|${RE_DOMINIO.source}`, 'gi')) || []);
                expect(achados, `VAZOU em "${nome}" para ${v}/${nivel}`).toEqual([]);
                if (nivel === 'secreta' && v === 'outro') expect(txt).not.toMatch(/desconhecida/i);
            }
        });
    });
});

describe('Dono com Raça secreta vê o placeholder; terceiros não veem nem a existência', () => {
    it('dono: "Raça desconhecida" em Composição, Domínio, Seletor e Resumo', () => {
        const ficha = FICHAS.secreta();
        preparar('dono', ficha);
        render(<><ComposicaoRacialFicha /><DominioRacialFicha /><SeletorRacaDaFicha valor="Saiyajin" aoMudar={() => {}} variante="ficha" /><ResumoDominioRacial cenario={CENARIO} ficha={ficha} viewer={VIEWER_DONO_JOGADOR} /></>);
        const txt = despejo();
        expect((txt.match(/Raça desconhecida/g) || []).length).toBeGreaterThanOrEqual(4);
        expect(vaza(txt)).toBe(false);
        // Humano (pública) segue visível com o seu Domínio
        expect(txt).toMatch(/Humano/);
        expect(txt).toMatch(/Domínio 30%/);
    });
    it('Mestre vê tudo e o seletor de visibilidade oferece os 3 níveis', () => {
        const ficha = FICHAS.secreta();
        preparar('mestre', ficha);
        render(envolver('mestre', <DominioRacialFicha />));
        const sel = document.querySelector('select[aria-label="Visibilidade de Saiyajin"]');
        expect(sel).toBeTruthy();
        expect(Array.from(sel.options).map(o => o.value)).toEqual(['publica', 'privada', 'secreta']);
        expect(sel.value).toBe('secreta');
    });
    it('dono NÃO recebe o seletor de visibilidade de Raça secreta nem opção "secreta" nas demais', () => {
        const ficha = fichaCom({ saiyajin: 'secreta' });
        preparar('dono', ficha);
        render(<DominioRacialFicha />);
        expect(document.querySelector('select[aria-label="Visibilidade de Saiyajin"]')).toBeNull();
        const humano = document.querySelector('select[aria-label="Visibilidade de Humano"]');
        expect(Array.from(humano.options).map(o => o.value)).not.toContain('secreta');
    });
    it('dono com Raça PRIVADA: seletor mostra privada e só publica/privada', () => {
        const ficha = FICHAS.privada();
        preparar('dono', ficha);
        render(<DominioRacialFicha />);
        const sel = document.querySelector('select[aria-label="Visibilidade de Saiyajin"]');
        expect(sel.value).toBe('privada');
        expect(Array.from(sel.options).map(o => o.value)).toEqual(['publica', 'privada']);
    });
});

describe('Pedir nova Raça (diálogo) não revela Raça secreta do dono', () => {
    it('lista de Raças livres não inclui a secreta e o aviso do diálogo não a cita', () => {
        const ficha = fichaCom({ saiyajin: 'secreta' });
        ficha.poderes = [{ id: 1, nome: 'DNA', manipulaDNA: true }];
        preparar('dono', ficha);
        render(<ComposicaoRacialFicha />);
        fireEvent.click(document.querySelector('button.btn-gold'));
        const txt = despejo();
        expect(txt).toMatch(/Namekuseijin/);
        expect(vaza(txt)).toBe(false);
    });
    it('SERVIÇO: jogador pedindo (por fora da UI) a própria Raça secreta não recebe o nome na mensagem de erro', () => {
        const ficha = fichaCom({ saiyajin: 'secreta' });
        ficha.poderes = [{ id: 1, nome: 'DNA', manipulaDNA: true }];
        preparar('dono', ficha);
        const r = svc.pedirRacaAdquirida('saiyajin', 'quero');
        expect(r.ok).toBe(false);
        expect(r.mensagem || '').not.toMatch(RE_RACA);
    });
});

// ---------- 2. mensagens de acesso / bloqueio ----------
describe.each(NIVEIS)('Mensagens de acesso e bloqueio: Raça %s', (nivel) => {
    it.each(VIEWERS)('viewer %s', (v) => {
        const ficha = FICHAS[nivel]();
        const c = CTX[v];
        const saidas = [];
        saidas.push(motivoSemAcessoVisivel(CENARIO, ficha, genki, c.viewer));
        saidas.push(motivoSemAcessoVisivel(CENARIO, ficha, zenkai, c.viewer));
        saidas.push(JSON.stringify(poderBloqueadoVisivel(CENARIO, ficha, zenkai, c.viewer)));
        saidas.push(mascararTextoRaca(CENARIO, ficha, 'Ele é Saiyajin (ou "sayajin"), puro Saiyajin.', c.viewer));
        if (v !== 'outro') {
            saidas.push(JSON.stringify(verificarAcessoHabilidadeRaca({ cenario: CENARIO, ficha, poder: genki, isMestre: c.isMestre })));
            saidas.push(JSON.stringify(verificarAcessoHabilidadeRaca({ cenario: CENARIO, ficha, poder: { ...zenkai, racasAcesso: ['humano'], id: 9 }, isMestre: c.isMestre })));
            saidas.push(JSON.stringify(poderBloqueadoParaDono(CENARIO, ficha, zenkai, c.isMestre)));
        }
        const txt = saidas.join('\n');
        if (podeVer(nivel, v)) {
            expect(txt).toMatch(/Saiyajin/);
            expect(txt).toMatch(/70/);
        } else {
            // O texto cru do bloqueio genérico pode citar o MÍNIMO (80%), nunca a Raça nem o Domínio 70.
            expect(txt.match(new RegExp(`${RE_RACA.source}|${RE_DOMINIO.source}`, 'gi')) || [], `mensagem vazou para ${v}/${nivel}`).toEqual([]);
        }
    });
    it('a decisão de bloquear continua usando os dados reais (mecânica intacta)', async () => {
        const { poderBloqueado, racaTemAcesso } = await import('../../core/racas');
        const ficha = FICHAS[nivel]();
        expect(poderBloqueado(CENARIO, ficha, zenkai).bloqueado).toBe(true); // 70 < 80 em qualquer nível
        expect(racaTemAcesso(CENARIO, ficha, { ...zenkai, percentualMinimo: 50 })).toBe(true);
    });
});

// ---------- 3. Sexta-Feira ----------
describe.each(NIVEIS)('Sexta-Feira: Raça %s', (nivel) => {
    it.each(VIEWERS)('viewer %s', async (v) => {
        const ficha = FICHAS[nivel]();
        ficha.poderes = [{ ...zenkai, ativa: false }];
        const c = CTX[v];
        const estado = {
            meuNome: c.meuNome, isMestre: c.isMestre, cenario: CENARIO,
            minhaFicha: v === 'dono' ? ficha : { bio: { raca: 'Humano', racaId: 'humano' }, poderes: [] },
            personagens: v === 'dono' ? {} : { Kai: ficha },
        };
        const saidas = [];
        saidas.push(JSON.stringify(await executarFerramenta('consultar_ficha', { nome: 'Kai' }, estado)));
        saidas.push(JSON.stringify(await executarFerramenta('listar_personagens', {}, estado)));
        if (v === 'dono') {
            saidas.push(montarContextoInicial(estado));
            saidas.push(montarContextoFicha(ficha, 'Kai', { cenario: CENARIO, isMestre: false }));
            saidas.push(JSON.stringify(resumoFichaDetalhado('Kai', ficha, { cenario: CENARIO, meuNome: 'Kai', isMestre: false })));
        }
        if (v === 'mestre') {
            saidas.push(montarContextoFicha(ficha, 'Kai', { cenario: CENARIO, isMestre: true }));
        }
        const txt = saidas.join('\n');
        if (podeVer(nivel, v)) expect(txt).toMatch(/Saiyajin/);
        else expect(txt.match(new RegExp(`${RE_RACA.source}`, 'gi')) || [], `Sexta-Feira vazou para ${v}/${nivel}`).toEqual([]);
        if (!podeVer(nivel, v)) expect(RE_DOMINIO.test(txt)).toBe(false);
    });
});

// ---------- 4. Feed (público) ----------
describe('Feed só nomeia Raça pública e a revelação', () => {
    const feeds = () => sync.enviarParaFeed.mock.calls.map(c => c[0].texto);
    const comZenkai = (vis) => { const f = fichaCom(vis); f.poderes = [{ ...zenkai, id: 5, racasAcesso: ['saiyajin'], percentualMinimo: 90, ativa: true }, { id: 9, nome: 'DNA', manipulaDNA: true }]; return f; };
    it.each(['secreta', 'privada'])('Mestre pratica/adiciona/aprova/desliga com Saiyajin %s: nada de Saiyajin nem Domínio no Feed', (nivel) => {
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Kai', cenario: CENARIO, minhaFicha: comZenkai({ saiyajin: nivel }), personagens: {} });
        expect(svc.concederPraticaRacial(ENTIDADE, 'saiyajin', 5).ok).toBe(true);
        expect(svc.definirComposicaoRacial(ENTIDADE, [{ racaId: 'saiyajin', percentual: 10, origem: 'nativa' }]).ok).toBe(true);
        svc.definirPercentualMinimoDoPoder(ENTIDADE, 5, 40);
        const todos = feeds().join(' | ');
        expect(todos.length).toBeGreaterThan(0);
        expect(todos).not.toMatch(RE_RACA);
        expect(todos).not.toMatch(/\d+\s*%\s*→|→/);
    });
    it('pedido de Raça (jogador) com Saiyajin secreta no Feed: genérico', () => {
        const f = fichaCom({ saiyajin: 'secreta' });
        f.poderes = [{ id: 9, nome: 'DNA', manipulaDNA: true }];
        useStore.setState({ isMestre: false, meuNome: 'Kai', cenario: CENARIO, minhaFicha: f, personagens: {} });
        svc.pedirRacaAdquirida('namekuseijin', 'm');
        expect(feeds().join('|')).not.toMatch(RE_RACA);
    });
    it('pública: nomeia a Raça e o Domínio; revelação pelo Mestre nomeia a Raça', () => {
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Kai', cenario: CENARIO, minhaFicha: comZenkai(null), personagens: {} });
        svc.concederPraticaRacial(ENTIDADE, 'saiyajin', 5);
        expect(feeds().join('|')).toMatch(/praticou Saiyajin: 70% → 75%/);
        vi.clearAllMocks();
        useStore.setState({ minhaFicha: comZenkai({ saiyajin: 'secreta' }) });
        svc.definirVisibilidadeRaca(ENTIDADE, 'saiyajin', 'privada');
        expect(feeds()).toEqual([]);
        svc.definirVisibilidadeRaca(ENTIDADE, 'saiyajin', 'publica');
        expect(feeds()).toEqual(['🧬 A Raça de Kai foi revelada: Saiyajin']);
    });
    it('_principal (texto livre) revelada nomeia o texto da ficha', () => {
        const f = { bio: { raca: 'Saiyajin', racaVisibilidade: { _principal: 'secreta' } }, poderes: [] };
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Kai', cenario: { racas: [RACAS[1]] }, minhaFicha: f, personagens: {} });
        svc.definirVisibilidadeRaca(ENTIDADE, '_principal', 'publica');
        expect(feeds()).toEqual(['🧬 A Raça de Kai foi revelada: Saiyajin']);
    });
});

// ---------- 5. permissões: matriz ator × nível atual × nível novo ----------
describe('definirVisibilidadeRaca: matriz de permissões', () => {
    const atores = {
        'dono jogador (própria ficha)': { isMestre: false, alvo: 'eu' },
        'jogador em ficha ALHEIA': { isMestre: false, alvo: 'outro' },
        'Mestre na própria ficha': { isMestre: true, alvo: 'eu' },
        'Mestre/Co-Mestre em ficha de OUTRO': { isMestre: true, alvo: 'outro' },
        'Mestre em Modo Jogador (própria)': { isMestre: false, alvo: 'eu' },
        'Mestre em Modo Jogador (alheia)': { isMestre: false, alvo: 'outro' },
    };
    const esperado = (ator, atual, novo) => {
        if (ator.isMestre) return true;
        if (ator.alvo !== 'eu') return false;
        if (atual === 'secreta') return false;
        return novo === 'publica' || novo === 'privada';
    };
    Object.entries(atores).forEach(([nomeAtor, ator]) => {
        NIVEIS.forEach((atual) => {
            NIVEIS.forEach((novo) => {
                it(`${nomeAtor}: ${atual} -> ${novo}`, () => {
                    const modo = /Modo Jogador/.test(nomeAtor);
                    const f = atual === 'publica' ? fichaCom(null) : fichaCom({ saiyajin: atual });
                    useStore.setState({
                        isMestre: ator.isMestre, souMestreReal: ator.isMestre || modo, modoJogador: modo, meuNome: 'Kai', cenario: CENARIO,
                        minhaFicha: ator.alvo === 'eu' ? f : fichaCom(null), personagens: ator.alvo === 'outro' ? { Vegeta: f } : {},
                    });
                    const ent = ator.alvo === 'eu' ? ENTIDADE : { id: 'Vegeta', nome: 'Vegeta' };
                    const r = svc.definirVisibilidadeRaca(ent, 'saiyajin', novo);
                    const mudou = atual !== novo;
                    expect(r.ok).toBe(esperado(ator, atual, novo) || (!esperado(ator, atual, novo) && false));
                    // Recusado: NADA gravado.
                    if (!r.ok) {
                        expect(sync.salvarCamposPersonagem).not.toHaveBeenCalled();
                        expect(sync.salvarFichaSilencioso).not.toHaveBeenCalled();
                        if (ator.alvo === 'eu') expect(useStore.getState().minhaFicha.bio.racaVisibilidade?.saiyajin ?? 'publica').toBe(atual);
                    } else if (mudou && ator.alvo === 'outro') {
                        expect(sync.salvarCamposPersonagem).toHaveBeenCalledWith('Vegeta', { 'bio/racaVisibilidade/saiyajin': novo === 'publica' ? null : novo });
                    }
                });
            });
        });
    });
    it("'_principal': jogador alterna e Mestre define; jogador não mexe se secreta", () => {
        const f = { bio: { raca: 'Xpto', racaVisibilidade: { _principal: 'secreta' } }, poderes: [] };
        useStore.setState({ isMestre: false, meuNome: 'Kai', cenario: CENARIO, minhaFicha: f, personagens: {} });
        expect(svc.definirVisibilidadeRaca(ENTIDADE, '_principal', 'publica').ok).toBe(false);
        useStore.setState({ isMestre: true });
        expect(svc.definirVisibilidadeRaca(ENTIDADE, '_principal', 'privada').ok).toBe(true);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toEqual({ _principal: 'privada' });
    });
    it("Mestre em OUTRO personagem: '_principal' grava granular em bio/racaVisibilidade/_principal", () => {
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Mestre', cenario: CENARIO, minhaFicha: fichaCom(null), personagens: { Vegeta: { bio: { raca: 'Xpto' }, poderes: [] } } });
        expect(svc.definirVisibilidadeRaca({ id: 'Vegeta', nome: 'Vegeta' }, '_principal', 'secreta').ok).toBe(true);
        expect(sync.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(sync.salvarCamposPersonagem).toHaveBeenCalledWith('Vegeta', { 'bio/racaVisibilidade/_principal': 'secreta' });
        expect(sync.salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('UI do Mestre em ficha de OUTRO grava granular e NÃO toca a própria ficha', () => {
        preparar('mestre', fichaCom(null));
        render(envolver('mestre', <DominioRacialFicha />));
        fireEvent.change(document.querySelector('select[aria-label="Visibilidade de Saiyajin"]'), { target: { value: 'secreta' } });
        expect(sync.salvarCamposPersonagem).toHaveBeenCalledWith('Kai', { 'bio/racaVisibilidade/saiyajin': 'secreta' });
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
    });
    it('nome da chave inválida/injeção é recusada', () => {
        useStore.setState({ isMestre: true, meuNome: 'Kai', cenario: CENARIO, minhaFicha: fichaCom(null), personagens: {} });
        ['../x', 'a/b', 'saiyajin/../x', '', null, undefined, 42, '__proto__', 'constructor'].forEach((k) => {
            expect(svc.definirVisibilidadeRaca(ENTIDADE, k, 'secreta').ok, String(k)).toBe(false);
        });
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
    });
});

// ---------- 6. troca da principal / remoção ----------
describe('Troca da Raça principal e remoção limpam a visibilidade', () => {
    it('principal derivada (sem composição explícita) secreta: Mestre troca para outra => visibilidade antiga some', () => {
        const f = { bio: { raca: 'Saiyajin', racaId: 'saiyajin', racaVisibilidade: { saiyajin: 'secreta' } }, poderes: [] };
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Kai', cenario: CENARIO, minhaFicha: f, personagens: {} });
        expect(definirRacaDoPersonagemDireto(ENTIDADE, 'humano')).toBe(true);
        const bio = useStore.getState().minhaFicha.bio;
        expect(bio.racaVisibilidade).toBeUndefined();
        expect(bio.raca).toBe('Humano');
    });
    it('principal em texto livre secreta ("_principal") vira catalogada: chave órfã removida', () => {
        const f = { bio: { raca: 'Xpto', racaVisibilidade: { _principal: 'secreta' } }, poderes: [] };
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Kai', cenario: CENARIO, minhaFicha: f, personagens: {} });
        definirRacaDoPersonagemDireto(ENTIDADE, 'humano');
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
    });
    it('jogador NÃO troca a principal secreta; troca a privada', () => {
        useStore.setState({ isMestre: false, meuNome: 'Kai', cenario: CENARIO, minhaFicha: fichaCom({ saiyajin: 'secreta' }), personagens: {} });
        expect(definirRacaDoPersonagemDireto(ENTIDADE, 'humano')).toBe(false);
        expect(useStore.getState().minhaFicha.bio.raca).toBe('Saiyajin');
        useStore.setState({ minhaFicha: fichaCom({ saiyajin: 'privada' }) });
        expect(definirRacaDoPersonagemDireto(ENTIDADE, 'humano')).toBe(true);
    });
    it('remover da composição limpa a chave e, se re-adicionada, volta PÚBLICA (não herda segredo velho)', () => {
        const f = fichaCom({ humano: 'secreta' });
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Kai', cenario: CENARIO, minhaFicha: f, personagens: {} });
        svc.removerRacaDaComposicao(ENTIDADE, 'humano');
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
        svc.adicionarRacaAdquirida(ENTIDADE, 'humano');
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toBeUndefined();
    });
    it('Raça principal hoje fora da composição explícita mantém a visibilidade (não some por engano)', () => {
        const f = { bio: { raca: 'Humano', racaId: 'humano', composicaoRacial: [{ racaId: 'saiyajin', percentual: 40, origem: 'adquirida' }], racaVisibilidade: { humano: 'secreta', namekuseijin: 'secreta' } }, poderes: [] };
        useStore.setState({ isMestre: true, souMestreReal: true, meuNome: 'Kai', cenario: CENARIO, minhaFicha: f, personagens: {} });
        svc.definirComposicaoRacial(ENTIDADE, [{ racaId: 'saiyajin', percentual: 40, origem: 'adquirida' }]);
        expect(useStore.getState().minhaFicha.bio.racaVisibilidade).toEqual({ humano: 'secreta' });
    });
});

// ---------- 7. compatibilidade: fichas sem racaVisibilidade ----------
describe('Fichas sem racaVisibilidade (ou com lixo) se comportam como antes', () => {
    it.each([['ausente', null], ['vazio', {}], ['valor inválido', { saiyajin: 'SECRETA' }], ['array', ['secreta']], ['string', 'secreta'], ['chave de outra Raça', { humano: 'secreta' }]])('%s: Saiyajin visível a todos', (_n, vis) => {
        const f = fichaCom(null);
        if (vis !== null) f.bio.racaVisibilidade = vis;
        ['dono', 'outro', 'mestre'].forEach((v) => {
            preparar(v, f);
            const { unmount } = render(envolver(v, <ComposicaoRacialFicha />));
            expect(despejo(), v).toMatch(/Saiyajin/);
            unmount();
        });
    });
    it('visivelPara: valores desconhecidos tratados como pública (comportamento antigo)', () => {
        expect(visivelPara({ nivel: undefined })).toBe(true);
        expect(visivelPara({ nivel: 'xpto' })).toBe(true);
        expect(visivelPara({ nivel: 'secreta', souMestre: false, souDono: true })).toBe(false);
    });
    it('Modo Jogador do Mestre enxerga como jogador (secreta some)', () => {
        const f = FICHAS.secreta();
        useStore.setState({ isMestre: false, souMestreReal: true, modoJogador: true, meuNome: 'Mestre', cenario: CENARIO, minhaFicha: { bio: { raca: 'Humano' }, poderes: [] }, personagens: { Kai: f } });
        render(<FichaAlvoProvider nome="Kai"><ComposicaoRacialFicha /><DominioRacialFicha /></FichaAlvoProvider>);
        expect(vaza(despejo())).toBe(false);
    });
});

// Evita aviso de import não usado em alguns bundlers.
void SeletorRaca;

// ---------- 8. '_principal' (Raça em texto livre, fora do catálogo) ----------
describe.each(['secreta', 'privada'])("'_principal' em texto livre: %s", (nivel) => {
    it.each(VIEWERS)('viewer %s', (v) => {
        const f = { bio: { raca: 'Saiyajin', racaVisibilidade: { _principal: nivel } }, poderes: [] };
        const c = CTX[v];
        useStore.setState({
            isMestre: c.isMestre, souMestreReal: c.isMestre, modoJogador: false, meuNome: c.meuNome, cenario: { racas: [RACAS[1]] },
            minhaFicha: v === 'dono' ? f : { bio: { raca: 'Humano', racaId: 'humano' }, poderes: [] }, personagens: v === 'dono' ? {} : { Kai: f },
        });
        render(envolver(v, <><DominioRacialFicha /><ComposicaoRacialFicha /><SeletorRacaDaFicha valor="Saiyajin" aoMudar={() => {}} variante="ficha" /></>));
        const txt = despejo();
        if (podeVer(nivel, v)) expect(txt).toMatch(/Saiyajin/);
        else {
            expect(txt.match(RE_RACA) || []).toEqual([]);
            if (nivel === 'secreta' && v === 'outro') expect(txt).not.toMatch(/desconhecida/i);
        }
        if (nivel === 'secreta' && v === 'dono') expect(txt).toMatch(/Raça desconhecida/);
    });
});
