import React from 'react';
import { AIFormProvider } from './AIFormContext';
import { AIHeader, AIAreaCentral } from './AISubComponents';

export default function AIPanel() {
    return (
        <AIFormProvider>
            <div className="sexta-aba">
                <AIHeader />
                <AIAreaCentral />
            </div>
        </AIFormProvider>
    );
}