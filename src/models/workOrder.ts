import { Schema, model } from 'mongoose';

const workItemSchema = new Schema({
	id: { type: String, required: false },
	description: { type: String, required: true },
	mechanicId: { type: String, required: false },
	mechanicName: { type: String, required: false },
	quantity: { type: Number, required: true, default: 1 },
	price: { type: Number, required: true, default: 0 },
	productId: { type: Schema.Types.ObjectId, ref: 'Product', required: false },
	hideQuantityInPdf: { type: Boolean, required: false, default: false },
	trackStock: { type: Boolean, required: false, default: false },
});

const workOrderSchema = new Schema({
	workOrderNumber: { type: Number, required: true },
	date: { type: Date, required: true, default: Date.now },
	clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
	vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
	customerComplaint: { type: String, required: false },
	initialDiagnosis: { type: String, required: false },
	requestedWork: { type: String, required: false },
	mileage: { type: Number, required: false },
	workItems: { type: [workItemSchema], required: false, default: [] },
	status: {
		type: String,
		enum: ['scheduled', 'in_progress', 'done'],
		required: true,
		default: 'scheduled',
	},
	totalCost: { type: Number, required: false, default: 0 },
	companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
	createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
	assignedMechanic: { type: Schema.Types.ObjectId, ref: 'MechanicAuth', required: false },
	deleted: { type: Boolean, default: false, required: true },
	convertedToInvoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: false },
	convertedToQuote: { type: Schema.Types.ObjectId, ref: 'Quote', required: false },
}, { timestamps: true });

workOrderSchema.index({ companyId: 1, deleted: 1 });
workOrderSchema.index({ status: 1 });

const WorkOrder = model('WorkOrder', workOrderSchema);

export default WorkOrder;
