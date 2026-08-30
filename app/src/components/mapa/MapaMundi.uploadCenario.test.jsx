import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto, uploadImagem } from '../../services/firebase-sync';

// ==========================================================================
// NOTA DE ESCOPO (mesmo padrão de MapaMundi.sincronizacaoCena.test.jsx):
// MapaMundi.jsx é grande e cai em múltiplas "telas" alternadas por state
// local (`nivelVisao`). Aqui usamos o mesmo truque dos testes irmãos:
// mockar `./MapaFormContext` com um `useMapaForm()` retornando um
// `cenaRenderId` válido para pular direto pra tela 'reino' (onde vive o
// modal "Configurar Cenário"), sem precisar montar um <MapaFormProvider>
// real (que arrastaria @react-three/fiber/three.js).
//
// `../../services/firebase-sync` é mockado por inteiro: os testes abaixo
// controlam manualmente as Promises de `uploadImagem`/`salvarCenarioCompleto`
// para exercitar sucesso, falha e o estado pendente (`salvandoCenario`).
//
// Cobertura:
//   1) Upload de arquivo bem-sucedido -> uploadImagem chamado com o arquivo,
//      modal fecha ao final.
//   2) uploadImagem rejeita -> alerta genérico de erro de upload, modal
//      permanece aberto.
//   3) uploadImagem resolve mas salvarCenarioCompleto resolve `false` (nunca
//      rejeita, ver firebase-sync.js) -> alerta ESPECÍFICO de "não foi
//      possível salvar" (não o genérico), modal permanece aberto.
//   4) Input de arquivo e botão "SALVAR CENÁRIO" ficam desabilitados
//      enquanto a Promise está pendente, e voltam ao normal ao resolver.
//   5) Reabrir o modal (fechar com "X" e clicar "⚙️ EDITAR CENÁRIO" de novo)
//      reseta um `salvandoCenario` travado (upload que nunca resolve).
//   6) Colar URL e clicar "💾 SALVAR CENÁRIO" (`salvarUrl`) -> chama
//      salvarCenarioCompleto com a URL colada, SEM passar por uploadImagem,
//      e fecha o modal em caso de sucesso.
//
// Fora de escopo aqui: o restante das telas cósmicas (sistema_solar,
// cosmologia, globo, continente) e o fluxo de `entrarNoMapaDeBatalha` — já
// cobertos (ou deliberadamente fora de escopo) pelos testes irmãos.
// ==========================================================================

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(),
}));

function mockUseStore(state) {
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
}

// Objeto controlável entre renders, igual ao padrão usado em
// MapaMundi.sincronizacaoCena.test.jsx.
let mockCtx = null;

vi.mock('./MapaFormContext', () => ({
    useMapaForm: () => mockCtx,
    urlSeguraParaCss: (url) => {
        if (!url || typeof url !== 'string') return '';
        const trimmed = url.trim();
        if (!/^https?:\/\//i.test(trimmed) && !/^data:image\//i.test(trimmed)) return '';
        return `url("${trimmed.replace(/["\\)]/g, '')}")`;
    },
}));

function renderNaTelaReino() {
    mockCtx = { cenaRenderId: 'cena-x', cenaAtual: { nome: 'Sala do Trono', img: '' } };
    return render(
        <MapaMundi>
            <div data-testid="grelha-de-batalha">GRELHA</div>
        </MapaMundi>
    );
}

function abrirModalCenario() {
    fireEvent.click(screen.getByText('⚙️ EDITAR CENÁRIO'));
    expect(screen.getByText('Configurar Cenário')).toBeDefined();
}

function getInputArquivo(container) {
    return container.querySelector('input[type="file"]');
}

function getBotaoSalvar() {
    return screen.getByRole('button', { name: /SALVAR CENÁRIO|SALVANDO/ });
}

function criarArquivoFake(nome = 'foto.png') {
    return new File(['conteudo-fake'], nome, { type: 'image/png' });
}

describe('MapaMundi - upload/salvamento de Cenário (tela reino)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockUseStore({
            cenario: { ativa: null, lista: {} },
            setCenario: vi.fn(),
        });
        mockCtx = null;
        vi.spyOn(window, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('Happy Path: upload de arquivo bem-sucedido chama uploadImagem com o arquivo e fecha o modal', async () => {
        const arquivo = criarArquivoFake();
        uploadImagem.mockResolvedValue('https://storage.exemplo.com/mapas/foto.png');
        salvarCenarioCompleto.mockResolvedValue(true);

        const { container } = renderNaTelaReino();
        abrirModalCenario();

        const inputArquivo = getInputArquivo(container);
        fireEvent.change(inputArquivo, { target: { files: [arquivo] } });

        await waitFor(() => {
            expect(uploadImagem).toHaveBeenCalledTimes(1);
        });
        expect(uploadImagem.mock.calls[0][0]).toBe(arquivo);
        expect(uploadImagem.mock.calls[0][1]).toMatch(/^mapas\//);

        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const dadosSalvos = salvarCenarioCompleto.mock.calls[0][0];
        expect(dadosSalvos.lista['cena-x'].img).toBe('https://storage.exemplo.com/mapas/foto.png');

        await waitFor(() => {
            expect(screen.queryByText('Configurar Cenário')).toBeNull();
        });
    });

    it('Error Case: uploadImagem rejeita -> mostra alerta genérico de erro de upload e mantém o modal aberto', async () => {
        const arquivo = criarArquivoFake();
        uploadImagem.mockRejectedValue(new Error('Falha de rede'));

        const { container } = renderNaTelaReino();
        abrirModalCenario();

        fireEvent.change(getInputArquivo(container), { target: { files: [arquivo] } });

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(
                'Erro ao enviar a imagem para o Mapa. Verifique sua conexão ou tente uma imagem menor.'
            );
        });

        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
        // Modal não fecha sozinho: usuário ainda pode tentar de novo.
        expect(screen.getByText('Configurar Cenário')).toBeDefined();
    });

    it('Error Case: uploadImagem resolve mas salvarCenarioCompleto resolve false (falha ao gravar) -> mostra o alerta ESPECÍFICO de falha ao salvar (não o genérico)', async () => {
        const arquivo = criarArquivoFake();
        uploadImagem.mockResolvedValue('https://storage.exemplo.com/mapas/foto.png');
        // salvarCenarioCompleto nunca rejeita (ver firebase-sync.js) — sinaliza falha resolvendo `false`.
        salvarCenarioCompleto.mockResolvedValue(false);

        const { container } = renderNaTelaReino();
        abrirModalCenario();

        fireEvent.change(getInputArquivo(container), { target: { files: [arquivo] } });

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(
                '⚠️ Não foi possível salvar o fundo deste cenário no servidor — ele pode não aparecer para os outros jogadores. Verifique sua conexão e tente de novo.'
            );
        });

        // NÃO deve ter mostrado o alerta genérico de erro de upload.
        expect(window.alert).not.toHaveBeenCalledWith(
            'Erro ao enviar a imagem para o Mapa. Verifique sua conexão ou tente uma imagem menor.'
        );
        expect(window.alert).toHaveBeenCalledTimes(1);
        // Modal não fecha sozinho.
        expect(screen.getByText('Configurar Cenário')).toBeDefined();
    });

    it('Edge Case: input de arquivo e botão SALVAR CENÁRIO ficam desabilitados enquanto o upload está pendente, e voltam ao normal depois', async () => {
        const arquivo = criarArquivoFake();
        let resolveUpload;
        uploadImagem.mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
        salvarCenarioCompleto.mockResolvedValue(true);

        const { container } = renderNaTelaReino();
        abrirModalCenario();

        const inputArquivo = getInputArquivo(container);
        expect(inputArquivo.disabled).toBe(false);
        expect(getBotaoSalvar().disabled).toBe(false);

        fireEvent.change(inputArquivo, { target: { files: [arquivo] } });

        await waitFor(() => {
            expect(getBotaoSalvar().textContent).toContain('SALVANDO');
        });
        expect(getInputArquivo(container).disabled).toBe(true);
        expect(getBotaoSalvar().disabled).toBe(true);

        resolveUpload('https://storage.exemplo.com/mapas/foto.png');

        await waitFor(() => {
            expect(screen.queryByText('Configurar Cenário')).toBeNull();
        });
    });

    it('Edge Case: reabrir o modal (fechar com X e clicar EDITAR CENÁRIO de novo) destrava um salvandoCenario preso (upload que nunca resolve)', async () => {
        const arquivo = criarArquivoFake();
        // Upload nunca resolve nem rejeita — simula uma rede travada.
        uploadImagem.mockImplementation(() => new Promise(() => {}));

        const { container } = renderNaTelaReino();
        abrirModalCenario();

        fireEvent.change(getInputArquivo(container), { target: { files: [arquivo] } });

        await waitFor(() => {
            expect(getBotaoSalvar().disabled).toBe(true);
        });

        // Fecha o modal pelo botão "X" (salvandoCenario continua true internamente).
        fireEvent.click(screen.getByText('X'));
        expect(screen.queryByText('Configurar Cenário')).toBeNull();

        // Reabre o modal: o clique em "⚙️ EDITAR CENÁRIO" reseta salvandoCenario=false defensivamente.
        abrirModalCenario();

        expect(getInputArquivo(container).disabled).toBe(false);
        expect(getBotaoSalvar().disabled).toBe(false);
        expect(getBotaoSalvar().textContent).toContain('SALVAR CENÁRIO');
    });

    it('Happy Path: colar URL e clicar SALVAR CENÁRIO chama salvarCenarioCompleto com a URL, sem passar por uploadImagem, e fecha o modal', async () => {
        salvarCenarioCompleto.mockResolvedValue(true);

        renderNaTelaReino();
        abrirModalCenario();

        const inputUrl = screen.getByPlaceholderText('http://...');
        fireEvent.change(inputUrl, { target: { value: 'https://exemplo.com/cenario-colado.png' } });

        fireEvent.click(getBotaoSalvar());

        await waitFor(() => {
            expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        });
        const dadosSalvos = salvarCenarioCompleto.mock.calls[0][0];
        expect(dadosSalvos.lista['cena-x'].img).toBe('https://exemplo.com/cenario-colado.png');
        expect(uploadImagem).not.toHaveBeenCalled();

        await waitFor(() => {
            expect(screen.queryByText('Configurar Cenário')).toBeNull();
        });
    });
});
