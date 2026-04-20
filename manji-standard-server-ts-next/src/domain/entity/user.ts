export type UserProps = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

export class User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly createdAt: Date;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.name = props.name;
    this.createdAt = props.createdAt;
  }

  static create(props: UserProps): User {
    if (!props.id) throw new Error("id is required");
    const email = props.email.trim();
    if (!email || !email.includes("@")) throw new Error("email is invalid");
    const name = props.name.trim();
    if (!name) throw new Error("name is required");
    return new User({ id: props.id, email, name, createdAt: props.createdAt });
  }
}
