import { Schema, model } from 'mongoose';

export const workshopAppointmentSchema = new Schema({
	customer: {
		type: String,
		required: true,
	},
	vehicle: {
		type: String,
		required: true,
	},
	jobType: {
		type: String,
		required: true,
	},
	startTime: {
		type: Date,
		required: true,
	},
	endTime: {
		type: Date,
		required: true,
	},
	status: {
		type: String,
		required: true,
	},
	notes: {
		type: String,
		required: false,
	},
	mechanic: {
		type: String,
		required: false,
	},
	mechanicId: {
		type: Schema.Types.ObjectId,
		ref: 'MechanicAuth',
		required: false,
	},
	serviceBay: {
		type: String,
		required: false,
	},
	clientId: {
		type: Schema.Types.ObjectId,
		ref: 'Client',
		required: false,
	},
	vehicleId: {
		type: Schema.Types.ObjectId,
		ref: 'Vehicle',
		required: false,
	},
	companyId: {
		type: Schema.Types.ObjectId,
		ref: 'Company',
		required: true,
	},
	createdBy: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true,
	},
	deleted: {
		type: Boolean,
		default: false,
	},
}, {
	timestamps: true,
});

workshopAppointmentSchema.index({ companyId: 1, deleted: 1 });
workshopAppointmentSchema.index({ startTime: 1, endTime: 1 });

const WorkshopAppointment = model('WorkshopAppointment', workshopAppointmentSchema);

export default WorkshopAppointment;
