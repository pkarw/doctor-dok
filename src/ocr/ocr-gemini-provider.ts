import { DataLoadingStatus, DisplayableDataObject, EncryptedAttachment, Folder, Record } from '@/data/client/models';
import { findCodeBlocks } from "@/lib/utils";
import { AIResultEventType, ChatContextType, MessageType, MessageVisibility } from '@/contexts/chat-context';
import { ConfigContextType } from '@/contexts/config-context';
import { FolderContextType } from '@/contexts/folder-context';
import { RecordContextType } from '@/contexts/record-context';
import { prompts } from '@/data/ai/prompts';
import { toast } from 'sonner';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function parse(record: Record, chatContext: ChatContextType, configContext: ConfigContextType | null, folderContext: FolderContextType | null, updateRecordFromText: (text: string, record: Record, allowNewRecord: boolean) => Record|null, updateParseProgress: (record: Record, inProgress: boolean, error: any) => void, sourceImages: DisplayableDataObject[]): Promise<AIResultEventType> {
    const parseAIProvider = await configContext?.getServerConfig('llmProviderParse') as string;
    const geminiApiKey = await configContext?.getServerConfig('geminiApiKey') as string;

    if (!geminiApiKey) {
        toast.error('Please configure Gemini API key in settings');
        return Promise.reject('Gemini API key not configured');
    }

    return new Promise(async (resolve, reject) => {
        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

            // Convert images to base64
            const imageParts = await Promise.all(sourceImages.map(async (image) => {
                const response = await fetch(image.url);
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                return {
                    inlineData: {
                        data: (base64 as string).split(',')[1],
                        mimeType: image.contentType
                    }
                };
            }));

            // Prepare the prompt
            const prompt = record.transcription ? 
                prompts.recordParseMultimodalTranscription({ record, config: configContext }) :
                prompts.recordParseMultimodal({ record, config: configContext });

            // Generate content
            const result = await model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = response.text();

            // Process the response through the chat context for consistent handling
            chatContext.sendMessage({
                message: {
                    role: 'user',
                    createdAt: new Date(),
                    type: MessageType.Parse,
                    content: text
                },
                onResult: async (resultMessage, result) => {
                    if (result.finishReason !== 'error') {
                        if (result.finishReason === 'length') {
                            toast.error('Too many findings for one record. Try uploading attachments one per record')
                        }

                        resultMessage.recordRef = record;
                        updateParseProgress(record, false, null);
                        resultMessage.recordSaved = true;
                        await record.updateChecksumLastParsed();
                        updateRecordFromText(resultMessage.content, record, false);
                        resolve(result);
                    } else {
                        reject(result);
                    }
                },
                providerName: parseAIProvider
            });
        } catch (error) {
            console.error('Error in Gemini OCR:', error);
            reject(error);
        }
    });
} 