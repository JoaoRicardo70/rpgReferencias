import React from 'react';
import { render, screen, fireEvent, cleanup, act, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import ConstrutorProgressao from './ConstrutorProgressao';
import useStore from '../../stores/useStore';
import { obterReceita, RECEITAS } from '../../core/receitasProgressao';
import { LIMITE_CONTADORES } from '../../core/contadores';
import { LIMITE_GATILHOS_POR_FONTE } from '../../core/gatilhos';

// QA — modal "Progressão em combate": acessibilidade, passos, limites e o fluxo rascunho -> Gravar.

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaAlvoImediato: vi.fn(() => Promise.resolve()),
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
}));

let probe;
function Harness() { probe = usePoderesForm(); return null; }
function App({ children = <ConstrutorProgressao /> }) {
    return (<PoderesFormProvider><Harness />{children}</PoderesFormProvider>);
}

let fichaBase; let alertSpy;
const ct = (id, extra = {}) => ({ id, nome: `C${id}`, valor: 0, min: 0, max: 5, ...extra });
function resetStore({ poderes = [], contadores = [] } = {}) {
    useStore.setState({
        minhaFicha: { ...fichaBase, poderes, contadores }, meuNome: 'Heroi', isMestre: false, personagens: {},
        efeitosTemp: [], efeitosTempPassivos: [], poderEditandoId: null, rascunhosPoder: {},
    });
}
const minha = () => useStore.getState().minhaFicha;
const abrir = () => { fireEvent.click(screen.getByRole('button', { name: /Progressão em combate/ })); return screen.getByRole('dialog'); };
const escolher = (nome) => fireEvent.click(screen.getByText(nome, { selector: 'strong' }).closest('button'));
const irAoResumo = () => fireEvent.click(screen.getByText('Ver resumo'));
const rotulo = (txt) => screen.getByText(txt, { selector: 'span' }).closest('label');

beforeEach(() => {
    fichaBase = structuredClone(useStore.getState().minhaFicha);
    resetStore();
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('botão e abertura', () => {
    it('o botão existe, o diálogo começa fechado', () => {
        render(<App />);
        expect(screen.getByRole('button', { name: /Progressão em combate/ })).toBeTruthy();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('fora de um PoderesFormProvider não renderiza nada (sem quebrar)', () => {
        const { container } = render(<ConstrutorProgressao />);
        expect(container.innerHTML).toBe('');
    });
    it('a11y: role=dialog, aria-modal, nome acessível por aria-labelledby e foco inicial no painel', () => {
        render(<App />);
        const dlg = abrir();
        expect(dlg.getAttribute('aria-modal')).toBe('true');
        const id = dlg.getAttribute('aria-labelledby');
        expect(document.getElementById(id).textContent).toMatch(/Progressão em combate/);
        expect(screen.getByRole('dialog', { name: /Progressão em combate/ })).toBe(dlg);
        expect(document.activeElement).toBe(dlg);
    });
    it('o diálogo é montado em portal no body (fora do contêiner da seção)', () => {
        const { container } = render(<App />);
        const dlg = abrir();
        expect(container.contains(dlg)).toBe(false); expect(document.body.contains(dlg)).toBe(true);
    });
    it('passo 1 lista as 4 receitas e marca a etapa ativa', () => {
        render(<App />);
        const dlg = abrir();
        RECEITAS.forEach(r => expect(within(dlg).getByText(r.nome)).toBeTruthy());
        const ativa = dlg.querySelector('.progressao-etapa.ativa');
        expect(ativa.textContent).toMatch(/1\. Receita/);
        expect(dlg.querySelectorAll('.progressao-etapa')).toHaveLength(3);
    });
});

describe('teclado e fechamento', () => {
    it('Escape fecha e devolve o foco ao botão', async () => {
        render(<App />);
        const dlg = abrir();
        fireEvent.keyDown(dlg, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /Progressão em combate/ })));
    });
    it('Escape não propaga (não fecha outros modais/formulários pais)', () => {
        const pai = vi.fn();
        render(<div onKeyDown={pai}><App /></div>);
        const dlg = abrir();
        fireEvent.keyDown(dlg, { key: 'Escape' });
        expect(pai).not.toHaveBeenCalled();
    });
    it('trap de Tab: Tab no último foco volta ao primeiro; Shift+Tab no painel/primeiro vai ao último', () => {
        render(<App />);
        const dlg = abrir();
        const focaveis = Array.from(dlg.querySelectorAll('button:not([disabled])'));
        expect(focaveis.length).toBeGreaterThan(2);
        const primeiro = focaveis[0]; const ultimo = focaveis[focaveis.length - 1];
        ultimo.focus();
        fireEvent.keyDown(ultimo, { key: 'Tab' });
        expect(document.activeElement).toBe(primeiro);
        primeiro.focus();
        fireEvent.keyDown(primeiro, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(ultimo);
        dlg.focus();
        fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(ultimo);
    });
    it('Tab no meio da lista não é interceptado (comportamento nativo)', () => {
        render(<App />);
        const dlg = abrir();
        const focaveis = Array.from(dlg.querySelectorAll('button:not([disabled])'));
        focaveis[1].focus();
        const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        focaveis[1].dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
    });
    it('clique no fundo sem edição fecha', () => {
        render(<App />);
        const dlg = abrir();
        fireEvent.mouseDown(dlg.parentElement);
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('clique DENTRO do painel não fecha', () => {
        render(<App />);
        const dlg = abrir();
        fireEvent.mouseDown(dlg);
        expect(screen.getByRole('dialog')).toBeTruthy();
    });
    it('clique no fundo COM edição (campo alterado) NÃO fecha; Escape ainda fecha', () => {
        render(<App />);
        abrir(); escolher(RECEITAS[0].nome);
        const input = rotulo('Ganho de Poder (%)').querySelector('input');
        fireEvent.change(input, { target: { value: '7' } });
        fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('reabrir começa do zero (passo 1, sem receita, sem resultado)', () => {
        render(<App />);
        abrir(); escolher(RECEITAS[0].nome);
        fireEvent.click(screen.getByLabelText('Fechar'));
        const dlg = abrir();
        expect(dlg.querySelector('.progressao-etapa.ativa').textContent).toMatch(/1\. Receita/);
        expect(within(dlg).getByText(RECEITAS[1].nome)).toBeTruthy();
    });
});

describe('passos e Resumo', () => {
    it('escolher receita vai ao passo 2 com todos os campos nos valores padrão', () => {
        render(<App />);
        const dlg = abrir(); escolher('Ganho por evento');
        expect(dlg.querySelector('.progressao-etapa.ativa').textContent).toMatch(/2\. Campos/);
        expect(rotulo('Ganho de Poder (%)').querySelector('input').value).toBe('2');
        expect(rotulo('Como o ganho age').querySelector('select').value).toBe('multiplicar');
        expect(dlg.querySelectorAll('.progressao-campo')).toHaveLength(obterReceita('ganhoPorEvento').campos.length);
    });
    it('Voltar do passo 2 retorna às receitas; do passo 3 ao passo 2 mantendo o valor editado', () => {
        render(<App />);
        const dlg = abrir(); escolher('Ganho por evento');
        fireEvent.change(rotulo('Ganho de Poder (%)').querySelector('input'), { target: { value: '9' } });
        irAoResumo();
        expect(dlg.querySelector('.progressao-etapa.ativa').textContent).toMatch(/3\. Resumo/);
        fireEvent.click(screen.getByText('Voltar'));
        expect(rotulo('Ganho de Poder (%)').querySelector('input').value).toBe('9');
        fireEvent.click(screen.getByText('Voltar'));
        expect(within(dlg).getByText('Acumular e converter no fim da luta')).toBeTruthy();
    });
    it('Resumo mostra receita, contagem, nomes dos gatilhos e "automáticos e armados"', () => {
        render(<App />);
        const dlg = abrir(); escolher('Acumular e converter no fim da luta'); irAoResumo();
        const caixa = dlg.querySelector('.progressao-resumo-caixa');
        expect(caixa.textContent).toContain('2 gatilho(s) automáticos e armados');
        expect(caixa.textContent).toContain('1 contador(es)');
        expect(dlg.querySelectorAll('.progressao-item')).toHaveLength(2);
        expect(screen.getByText('Adicionar ao poder').disabled).toBe(false);
    });
    it('Resumo com opcionais = sim diz "opcionais e desarmados"', () => {
        render(<App />);
        const dlg = abrir(); escolher('Ganho por evento');
        fireEvent.change(rotulo('Criar opcionais e desarmados (o dono arma depois)').querySelector('select'), { target: { value: 'sim' } });
        irAoResumo();
        expect(dlg.querySelector('.progressao-resumo-caixa').textContent).toContain('opcionais e desarmados');
    });
    it('valores absurdos no campo são presos no resumo (percentual 99999 vira 1000)', () => {
        render(<App />);
        const dlg = abrir(); escolher('Ganho por evento');
        fireEvent.change(rotulo('Ganho de Poder (%)').querySelector('input'), { target: { value: '99999' } });
        irAoResumo();
        expect(dlg.querySelector('.progressao-item').textContent).toContain('1000%');
    });
    it('cada receita completa os 3 passos sem erro', () => {
        RECEITAS.forEach((r) => {
            cleanup(); resetStore();
            render(<App />);
            abrir(); escolher(r.nome); irAoResumo();
            expect(screen.getByText('Adicionar ao poder')).toBeTruthy();
        });
    });
});

describe('adicionar vai ao RASCUNHO e só grava no Gravar', () => {
    it('Adicionar insere gatilho(s)+contador no rascunho, mostra status e NÃO muda a ficha gravada', () => {
        render(<App />);
        const antes = JSON.stringify(minha());
        abrir(); escolher('Acumular e converter no fim da luta'); irAoResumo();
        fireEvent.click(screen.getByText('Adicionar ao poder'));
        expect(screen.getByRole('status').textContent).toMatch(/Adicionado ao rascunho: 2 gatilho\(s\) e 1 contador\(es\)/);
        expect(probe.gatilhosPoder.map(g => g.id)).toEqual(['rp_acumularEConverter_1_g1', 'rp_acumularEConverter_1_g2']);
        expect(probe.contadoresPoder.map(c => c.id)).toEqual(['rp_acumularEConverter_1_c']);
        expect(JSON.stringify(minha())).toBe(antes);
        expect(minha().poderes).toEqual([]); expect(minha().contadores).toEqual([]);
    });
    it('Gravar no Grimório (salvarNovoPoder) grava poder, gatilhos e contador com poderId, sem undefined', async () => {
        render(<App />);
        abrir(); escolher('Bônus a cada N eventos'); irAoResumo();
        fireEvent.click(screen.getByText('Adicionar ao poder'));
        act(() => { probe.setNomePoder('Adaptação'); probe.setDescricaoPoder('d'); });
        await act(async () => { probe.salvarNovoPoder(); });
        const f = minha();
        expect(f.poderes).toHaveLength(1);
        expect(f.poderes[0].gatilhos.map(g => g.id)).toEqual(['rp_bonusACadaN_1_g1', 'rp_bonusACadaN_1_g2']);
        expect(f.contadores).toHaveLength(1);
        expect(f.contadores[0]).toMatchObject({ id: 'rp_bonusACadaN_1_c', poderId: f.poderes[0].id, valor: 0, max: 3 });
        expect(JSON.stringify(f.poderes[0].gatilhos)).not.toContain('undefined');
        f.poderes[0].gatilhos.forEach(g => { expect(g.modo).toBe('automatico'); expect(g.armado).toBe(true); });
    });
    it('Cancelar (fechar sem adicionar) não toca no rascunho nem na ficha', () => {
        render(<App />);
        abrir(); escolher('Ganho por evento'); irAoResumo();
        fireEvent.click(screen.getByLabelText('Fechar'));
        expect(probe.gatilhosPoder).toEqual([]); expect(probe.contadoresPoder).toEqual([]);
        expect(minha().poderes).toEqual([]);
    });
    it('cancelar o formulário depois de adicionar descarta tudo e não grava nada', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<App />);
        abrir(); escolher('Acumular e converter no fim da luta'); irAoResumo();
        fireEvent.click(screen.getByText('Adicionar ao poder'));
        fireEvent.click(screen.getByText('Fechar', { selector: '.progressao-acoes button' }));
        expect(probe.gatilhosPoder).toHaveLength(2);
        act(() => { probe.cancelarEdicaoComConfirmacao(); });
        expect(probe.gatilhosPoder).toEqual([]); expect(probe.contadoresPoder).toEqual([]);
        expect(minha().contadores).toEqual([]); expect(minha().poderes).toEqual([]);
    });
    it('aplicar a MESMA receita 2x e 3x pelo modal usa instâncias 1, 2, 3 e contadores distintos', () => {
        render(<App />);
        for (let i = 0; i < 3; i++) {
            abrir(); escolher('Bônus a cada N eventos'); irAoResumo();
            fireEvent.click(screen.getByText('Adicionar ao poder'));
            fireEvent.click(screen.getByText('Fechar', { selector: '.progressao-acoes button' }));
        }
        expect(probe.gatilhosPoder.map(g => g.id)).toEqual(['1', '2', '3'].flatMap(k => [`rp_bonusACadaN_${k}_g1`, `rp_bonusACadaN_${k}_g2`]));
        expect(probe.contadoresPoder.map(c => c.id)).toEqual(['rp_bonusACadaN_1_c', 'rp_bonusACadaN_2_c', 'rp_bonusACadaN_3_c']);
    });
    it('id de contador já existente NA FICHA leva a receita para a instância seguinte', () => {
        resetStore({ contadores: [ct('rp_acumularEConverter_1_c')] });
        render(<App />);
        abrir(); escolher('Acumular e converter no fim da luta'); irAoResumo();
        fireEvent.click(screen.getByText('Adicionar ao poder'));
        expect(probe.contadoresPoder.map(c => c.id)).toEqual(['rp_acumularEConverter_2_c']);
        expect(probe.gatilhosPoder[0].id).toBe('rp_acumularEConverter_2_g1');
        expect(probe.gatilhosPoder[1].evento.tipo).toBe('fimDeLuta');
        expect(probe.gatilhosPoder[1].acoes[0].deContador.id).toBe('rp_acumularEConverter_2_c');
    });
    it('contador do RASCUNHO (adicionado pelo modal, ainda não gravado) também é considerado ao escolher o id', () => {
        render(<App />);
        const aplicarComTeto = () => {
            abrir(); escolher('Crescer por turno (Adaptação)');
            fireEvent.change(rotulo('Teto de turnos por combate (0 = sem teto; volta a cada fim de luta, troca de cena ou descanso)').querySelector('input'), { target: { value: '4' } });
            irAoResumo(); fireEvent.click(screen.getByText('Adicionar ao poder'));
            fireEvent.click(screen.getByText('Fechar', { selector: '.progressao-acoes button' }));
        };
        aplicarComTeto(); aplicarComTeto();
        expect(probe.contadoresPoder.map(c => c.id)).toEqual(['rp_crescerPorTurno_1_c', 'rp_crescerPorTurno_2_c']);
        expect(probe.gatilhosPoder.map(g => g.acoes[1].id)).toEqual(['rp_crescerPorTurno_1_c', 'rp_crescerPorTurno_2_c']);
    });
});

describe('limites 8 gatilhos / 12 contadores: bloqueio ANTES de adicionar', () => {
    const gatilhoSimples = (i) => ({ id: `g${i}`, nome: `G${i}`, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'ganhoPermanente', valor: 1 }] });

    it('ctxProgressao expõe ids usados e contagens', () => {
        resetStore({ contadores: [ct('a'), ct('b')] });
        render(<App />);
        act(() => { probe.setGatilhosPoder([gatilhoSimples(1), gatilhoSimples(2)]); probe.adicionarContadorPoder({ nome: 'R', min: 0, max: 2 }); });
        expect(probe.ctxProgressao.idsGatilhos).toEqual(['g1', 'g2']);
        expect(probe.ctxProgressao.idsContadores).toEqual(expect.arrayContaining(['a', 'b', probe.contadoresPoder[0].id]));
        expect(probe.ctxProgressao.existentes).toEqual({ gatilhos: 2, contadores: 3 });
    });
    it('provider: 7 gatilhos + receita de 2 => recusa e NADA muda (gatilhos e contadores idênticos)', () => {
        render(<App />);
        act(() => { probe.setGatilhosPoder(Array.from({ length: 7 }, (_, i) => gatilhoSimples(i))); });
        const gAntes = probe.gatilhosPoder; const cAntes = probe.contadoresPoder;
        const res = obterReceita('acumularEConverter').construir({}, probe.ctxProgressao);
        let r; act(() => { r = probe.adicionarProgressaoRascunho(res); });
        expect(r.ok).toBe(false); expect(r.erro).toContain(String(LIMITE_GATILHOS_POR_FONTE));
        expect(probe.gatilhosPoder).toBe(gAntes); expect(probe.contadoresPoder).toBe(cAntes);
    });
    it('provider: exatamente 8 de resultado final é aceito (6 + 2)', () => {
        render(<App />);
        act(() => { probe.setGatilhosPoder(Array.from({ length: 6 }, (_, i) => gatilhoSimples(i))); });
        const res = obterReceita('acumularEConverter').construir({}, probe.ctxProgressao);
        let r; act(() => { r = probe.adicionarProgressaoRascunho(res); });
        expect(r.ok).toBe(true); expect(probe.gatilhosPoder).toHaveLength(8); expect(probe.contadoresPoder).toHaveLength(1);
    });
    it('provider: ficha com 12 contadores recusa receita com contador e aceita a sem contador', () => {
        resetStore({ contadores: Array.from({ length: LIMITE_CONTADORES }, (_, i) => ct(`c${i}`)) });
        render(<App />);
        const comContador = obterReceita('bonusACadaN').construir({}, probe.ctxProgressao);
        let r; act(() => { r = probe.adicionarProgressaoRascunho(comContador); });
        expect(r.ok).toBe(false); expect(r.erro).toContain(String(LIMITE_CONTADORES));
        expect(probe.gatilhosPoder).toEqual([]); expect(probe.contadoresPoder).toEqual([]);
        const semContador = obterReceita('ganhoPorEvento').construir({}, probe.ctxProgressao);
        act(() => { r = probe.adicionarProgressaoRascunho(semContador); });
        expect(r.ok).toBe(true); expect(probe.gatilhosPoder).toHaveLength(1);
    });
    it('provider: contadores do RASCUNHO contam para o limite de 12 (11 na ficha + 1 no rascunho + receita com contador)', () => {
        resetStore({ contadores: Array.from({ length: LIMITE_CONTADORES - 1 }, (_, i) => ct(`c${i}`)) });
        render(<App />);
        act(() => { probe.adicionarContadorPoder({ nome: 'Rascunho', min: 0, max: 2 }); });
        const res = obterReceita('bonusACadaN').construir({}, probe.ctxProgressao);
        let r; act(() => { r = probe.adicionarProgressaoRascunho(res); });
        expect(r.ok).toBe(false); expect(probe.contadoresPoder).toHaveLength(1);
    });
    it('provider: contador com id já presente é reaproveitado sem aviso e sem duplicar', () => {
        render(<App />);
        const res = obterReceita('acumularEConverter').construir({}, { idsGatilhos: [], idsContadores: [] });
        let r1; let r2;
        act(() => { r1 = probe.adicionarProgressaoRascunho(res); });
        act(() => { r2 = probe.adicionarProgressaoRascunho(res); });
        expect(r1.avisos).toEqual([]); expect(r2.avisos).toEqual([]);
        expect(probe.contadoresPoder).toHaveLength(1);
    });
    it('UI: com 7 gatilhos, o Resumo mostra o erro (role=alert) e "Adicionar ao poder" fica desabilitado; nada é adicionado', () => {
        render(<App />);
        act(() => { probe.setGatilhosPoder(Array.from({ length: 7 }, (_, i) => gatilhoSimples(i))); });
        abrir(); escolher('Acumular e converter no fim da luta'); irAoResumo();
        expect(screen.getByRole('alert').textContent).toContain('8 gatilhos');
        const btn = screen.getByText('Adicionar ao poder');
        expect(btn.disabled).toBe(true);
        fireEvent.click(btn);
        expect(probe.gatilhosPoder).toHaveLength(7);
    });
    it('UI: com 12 contadores na ficha o Resumo bloqueia as receitas com contador', () => {
        resetStore({ contadores: Array.from({ length: LIMITE_CONTADORES }, (_, i) => ct(`c${i}`)) });
        render(<App />);
        abrir(); escolher('Crescer por turno (Adaptação)');
        fireEvent.change(rotulo('Teto de turnos por combate (0 = sem teto; volta a cada fim de luta, troca de cena ou descanso)').querySelector('input'), { target: { value: '3' } });
        irAoResumo();
        expect(screen.getByRole('alert').textContent).toContain('12 contadores');
        expect(screen.getByText('Adicionar ao poder').disabled).toBe(true);
    });
    it('UI: a mesma receita sem teto (sem contador) passa mesmo com 12 contadores', () => {
        resetStore({ contadores: Array.from({ length: LIMITE_CONTADORES }, (_, i) => ct(`c${i}`)) });
        render(<App />);
        abrir(); escolher('Crescer por turno (Adaptação)'); irAoResumo();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByText('Adicionar ao poder').disabled).toBe(false);
    });
});
