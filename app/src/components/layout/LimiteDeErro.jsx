import React from 'react';

// 🛡️ REDE DE PROTEÇÃO CONTRA "TELA BRANCA": se algo quebrar ao desenhar uma aba (ou num efeito
// síncrono dela), só aquela parte mostra o aviso abaixo — o resto do app continua funcionando.
//
// ⚠️ Única exceção à regra "sem class components" do projeto (autorizada pelo usuário): o React
// só permite capturar erros de renderização com uma classe (getDerivedStateFromError /
// componentDidCatch); não existe hook equivalente. Preferimos esta classe pequena a adicionar uma
// biblioteca (react-error-boundary) e mexer no package-lock.
//
// Erros em cliques e callbacks assíncronos não passam por aqui (e também não deixam a tela branca).
//
// Props:
//   area        — sujeito da frase do aviso, com maiúscula (ex.: "Esta aba", "O sistema").
//   chaveReset  — quando muda para um valor verdadeiro (ex.: voltar para a aba), tenta desenhar de novo.
//   compacto    — aviso pequeno, pra áreas menores (ex.: o dock de comunicação).
export default class LimiteDeErro extends React.Component {
    constructor(props) {
        super(props);
        this.state = { erro: null };
        this.tentarDeNovo = this.tentarDeNovo.bind(this);
    }

    static getDerivedStateFromError(erro) {
        return { erro };
    }

    componentDidCatch(erro, info) {
        console.error(`[LimiteDeErro] Falha em ${this.props.area || 'uma área do app'}:`, erro, info?.componentStack);
    }

    componentDidUpdate(propsAnteriores) {
        if (this.state.erro && this.props.chaveReset && propsAnteriores.chaveReset !== this.props.chaveReset) {
            this.setState({ erro: null });
        }
    }

    tentarDeNovo() {
        this.setState({ erro: null });
    }

    render() {
        if (!this.state.erro) return this.props.children;

        const area = this.props.area || 'Esta parte do app';
        const detalhe = String(this.state.erro?.message || this.state.erro || '').slice(0, 300);

        if (this.props.compacto) {
            return (
                <div className="limite-erro limite-erro-compacto" role="alert">
                    <span>⚠️ {area} parou de funcionar.</span>
                    <button type="button" className="limite-erro-btn" onClick={this.tentarDeNovo}>Tentar de novo</button>
                </div>
            );
        }

        return (
            <div className="limite-erro" role="alert">
                <h3 className="limite-erro-titulo">⚠️ {area} encontrou um erro</h3>
                <p className="limite-erro-texto">
                    O resto do sistema continua funcionando normalmente. Você pode tentar de novo,
                    trocar de aba ou recarregar a página.
                </p>
                {detalhe && <code className="limite-erro-detalhe">{detalhe}</code>}
                <div className="limite-erro-acoes">
                    <button type="button" className="limite-erro-btn" onClick={this.tentarDeNovo}>🔄 Tentar de novo</button>
                    <button type="button" className="limite-erro-btn secundario" onClick={() => window.location.reload()}>Recarregar a página</button>
                </div>
            </div>
        );
    }
}
