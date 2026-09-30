import React from 'react';
import { AIFormProvider } from './AIFormContext';
import { DialogosSextaProvider } from './DialogosSexta';
import { AIHeader, AIAreaCentral } from './AISubComponents';

export default function AIPanel() {
    return (
        <DialogosSextaProvider>
            <AIFormProvider>
                <div className="sexta-aba">
                    <AIHeader />
                    <AIAreaCentral />
                </div>
            </AIFormProvider>
        </DialogosSextaProvider>
    );
}
