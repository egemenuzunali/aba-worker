import { Schema, model } from 'mongoose'

// Partial schema for aba-worker - only includes fields needed for quarterly reports
const userSchema = new Schema({
	email: {
		type: String,
		required: true,
		unique: true,
	},
	firstName: {
		type: String,
		required: false,
	},
	lastName: {
		type: String,
		required: false,
	},
	companyId: {
		type: Schema.Types.ObjectId,
		ref: 'Company',
	},
}, { timestamps: true });

const User = model('User', userSchema);

export default User;
