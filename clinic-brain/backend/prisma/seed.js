"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const passwordHash = await bcryptjs_1.default.hash('Admin@123456', 10);
    const professional = await prisma.professional.upsert({
        where: { email: 'ana.silva@clinicbrain.local' },
        update: {
            name: 'Dra. Ana Silva',
            passwordHash,
            phoneNumber: '5527999990001',
            specialty: 'Psicanálise',
            consultationFeeCents: 18000,
            timezone: 'America/Sao_Paulo',
        },
        create: {
            name: 'Dra. Ana Silva',
            email: 'ana.silva@clinicbrain.local',
            passwordHash,
            phoneNumber: '5527999990001',
            specialty: 'Psicanálise',
            consultationFeeCents: 18000,
            timezone: 'America/Sao_Paulo',
        },
    });
    const patient = await prisma.patient.upsert({
        where: {
            professionalId_phoneNumber: {
                professionalId: professional.id,
                phoneNumber: '5527996087528',
            },
        },
        update: {
            name: 'Paciente Teste',
            status: 'ATIVO',
        },
        create: {
            professionalId: professional.id,
            name: 'Paciente Teste',
            phoneNumber: '5527996087528',
            email: 'paciente.teste@clinicbrain.local',
            firstConsultationAt: new Date(),
            status: 'ATIVO',
        },
    });
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 1);
    startsAt.setHours(15, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + 50);
    const existingAppointment = await prisma.appointment.findFirst({
        where: {
            professionalId: professional.id,
            startsAt,
            endsAt,
        },
    });
    const appointment = existingAppointment ??
        (await prisma.appointment.create({
            data: {
                professionalId: professional.id,
                patientId: patient.id,
                startsAt,
                endsAt,
                status: 'AGENDADO',
                notes: 'Consulta inicial de teste',
            },
        }));
    await prisma.settings.upsert({
        where: { professionalId: professional.id },
        update: {
            welcomeMessage: 'Olá, sou assistente da Dra. Ana. Como posso ajudar?',
            confirmationMessage: 'Você confirma sua consulta?',
            cancellationPolicy: 'Cancelamentos com 24h de antecedência.',
            reminderD1Enabled: true,
            reminder2hEnabled: true,
        },
        create: {
            professionalId: professional.id,
            welcomeMessage: 'Olá, sou assistente da Dra. Ana. Como posso ajudar?',
            confirmationMessage: 'Você confirma sua consulta?',
            cancellationPolicy: 'Cancelamentos com 24h de antecedência.',
            reminderD1Enabled: true,
            reminder2hEnabled: true,
        },
    });
    await prisma.whatsappSession.upsert({
        where: {
            professionalId_phoneNumber: {
                professionalId: professional.id,
                phoneNumber: patient.phoneNumber,
            },
        },
        update: {
            currentState: 'INITIAL',
            isActive: true,
            lastMessageAt: new Date(),
        },
        create: {
            professionalId: professional.id,
            phoneNumber: patient.phoneNumber,
            currentState: 'INITIAL',
            isActive: true,
            lastMessageAt: new Date(),
        },
    });
    const existingInteraction = await prisma.interaction.findFirst({
        where: {
            professionalId: professional.id,
            externalMessageId: 'seed-message-001',
        },
    });
    if (!existingInteraction) {
        await prisma.interaction.create({
            data: {
                professionalId: professional.id,
                patientId: patient.id,
                appointmentId: appointment.id,
                messageText: 'Mensagem inicial de teste para validação local.',
                messageType: 'BOT',
                externalMessageId: 'seed-message-001',
            },
        });
    }
    console.log('Seed concluída com dados mínimos.');
}
main()
    .catch((error) => {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
