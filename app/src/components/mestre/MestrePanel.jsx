import React from 'react';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import {
    MestreAcessoNegado,
    MestreVisorJogadores,
    MestreInjetorEntidades,
    MestreVozSistema,
    MestreForjaNPC // Adicionámos a importação aqui!
} from './MestreSubComponents';
import MestreControleTurno from './MestreControleTurno';
import EquipesRelacoes from './EquipesRelacoes';
import RacasCatalogo from './RacasCatalogo';
import MestreSegurarAcao from './MestreSegurarAcao';
import AtalhosMestre, { SecaoMestreAncora } from './AtalhosMestre';
import { MestreNotificacoesPedidos } from './MestrePedidosSexta';

function MestreConteudoSeguro() {
    const ctx = useMestreForm();
    if (!ctx) return null;
    if (!ctx.isMestre) return <MestreAcessoNegado />;

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ color: '#ffcc00', textShadow: '0 0 10px #ffcc00', borderBottom: '2px solid #ffcc00', paddingBottom: 10, margin: 0 }}>
                👑 DOMÍNIO DO MESTRE
            </h2>

            {/* 🧭 Atalhos para as seções desta página (inclui 🧬 Raças) */}
            <AtalhosMestre />

            {/* 🔔 Pedidos de criação feitos pelos jogadores à Sexta-Feira */}
            <SecaoMestreAncora id="pedidos"><MestreNotificacoesPedidos /></SecaoMestreAncora>

            {/* Controle de Turnos do combate (mesma ação do "Passar Turno" do Mapa) */}
            <SecaoMestreAncora id="turnos"><MestreControleTurno /></SecaoMestreAncora>

            {/* 🛡️ Equipes nomeadas, relações entre elas e quem está em qual lado */}
            <EquipesRelacoes />

            {/* 🧬 Catálogo de Raças da mesa e quem é de qual raça (acesso às Habilidades de Raça) */}
            <RacasCatalogo />

            {/* ⏳ Quantas Ações cada um pode segurar (Hold Action) */}
            <SecaoMestreAncora id="segurar"><MestreSegurarAcao /></SecaoMestreAncora>

            {/* Primeira linha: Visor, Injetor Rápido e Voz do Sistema */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <SecaoMestreAncora id="jogadores" className="mestre-secao-ancora--visor"><MestreVisorJogadores /></SecaoMestreAncora>
                <div style={{ flex: '1 1 35%', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <MestreInjetorEntidades />
                    <MestreVozSistema />
                </div>
            </div>

            {/* Segunda linha inteira: A nossa nova Forja de Vilões */}
            <SecaoMestreAncora id="forja"><MestreForjaNPC /></SecaoMestreAncora>
            
        </div>
    );
}

export default function MestrePanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <MestreFormProvider>
            <div className={className}>
                {hasChildren ? children : <MestreConteudoSeguro />}
            </div>
        </MestreFormProvider>
    );
}