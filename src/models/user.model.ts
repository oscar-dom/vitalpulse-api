import bcrypt from "bcrypt";
import { type HydratedDocument, type Model, model, Schema } from "mongoose";

// API accounts, not FHIR resources: a user is whoever calls the API, not a Practitioner
// of the clinical record. Admins manage the patient catalog; clinicians read patients
// and record observations.
export const USER_ROLES = ["admin", "clinician"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Same cost factor as the course book: 2^10 hashing rounds.
const BCRYPT_ROUNDS = 10;

export interface User {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModelType = Model<User, object, UserMethods>;
export type UserDocument = HydratedDocument<User, UserMethods>;

const userSchema = new Schema<User, UserModelType, UserMethods>(
  {
    name: {
      type: String,
      required: [true, "name is required"],
      trim: true,
      maxlength: [100, "name must have at most 100 characters"],
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "email must be a valid email address"],
    },
    // Stored as a bcrypt hash. Length rules (8-72) are checked on the plain password
    // by the request validation, since the model only ever sees the hash.
    // Excluded from queries unless explicitly requested with select("+password").
    password: { type: String, required: [true, "password is required"], select: false },
    role: { type: String, enum: USER_ROLES, default: "clinician" },
  },
  {
    timestamps: true,
    toJSON: {
      // Expose `id`, and never leak the password hash or the internal `__v`.
      transform: (_doc, ret) => {
        const { _id, __v: _version, password: _password, ...rest } = ret;
        return { id: String(_id), ...rest };
      },
    },
  },
);

// Hash only when the password is new or changed, so saving other fields does not
// hash the existing hash again.
userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  }
});

userSchema.method("comparePassword", function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
});

export const UserModel = model<User, UserModelType>("User", userSchema);
